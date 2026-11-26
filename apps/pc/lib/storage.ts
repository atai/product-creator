import { createStore, Store } from 'tinybase';
import * as path from 'path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import logger from './logger';
import { FunctionCard, Workflow, Stream, BusinessObject, Project, AppEntity } from './types';
import { BaseRepository } from './repository/BaseRepository';
import { FileSystemAdapter } from './repository/FileSystemAdapter';
import {
  functionConfig,
  workflowConfig,
  streamConfig,
  businessObjectConfig,
  projectConfig,
  appConfig,
} from './repository/configs';

const CONFIG_ROOT = path.resolve(process.cwd(), 'config');
const CONFIG_ROOTS = [CONFIG_ROOT];

/**
 * Refactored FunctionStorage using Repository Pattern
 * Single Responsibility: Coordination between repositories and file watching
 */
class FunctionStorage {
  private store: Store = createStore();
  private watcher: FSWatcher | null = null;
  private initialized = false;

  private fileSystem: FileSystemAdapter;
  private functionRepo: BaseRepository<FunctionCard>;
  private workflowRepo: BaseRepository<Workflow>;
  private streamRepo: BaseRepository<Stream>;
  private businessObjectRepo: BaseRepository<BusinessObject>;
  private projectRepo: BaseRepository<Project>;
  private appRepo: BaseRepository<AppEntity>;

  constructor() {
    this.fileSystem = new FileSystemAdapter();

    // Product repositories don't need roots - they use app.directory from config
    this.functionRepo = new BaseRepository(
      this.store,
      this.fileSystem,
      functionConfig,
      []
    );

    this.workflowRepo = new BaseRepository(
      this.store,
      this.fileSystem,
      workflowConfig,
      []
    );

    this.streamRepo = new BaseRepository(
      this.store,
      this.fileSystem,
      streamConfig,
      []
    );

    this.businessObjectRepo = new BaseRepository(
      this.store,
      this.fileSystem,
      businessObjectConfig,
      []
    );

    this.projectRepo = new BaseRepository(
      this.store,
      this.fileSystem,
      projectConfig,
      CONFIG_ROOTS
    );

    this.appRepo = new BaseRepository(
      this.store,
      this.fileSystem,
      appConfig,
      CONFIG_ROOTS
    );
  }

  async initialize() {
    if (this.initialized) return;

    logger.info('Initializing function storage');

    // Initialize tables
    this.store.setTables({
      functions: {},
      events: {},
      edges: {},
      workflows: {},
      streams: {},
      business_objects: {},
      projects: {},
      apps: {},
    });

    // Load initial data using repositories
    // First load projects and apps (from config), then load product data from app directories
    await this.loadAll();

    // Setup file watcher
    this.setupWatcher();

    this.initialized = true;
    logger.info('Function storage initialized');
  }

  private async loadAll() {
    // First load projects and apps from config
    const totalProjects = await this.projectRepo.loadAll();
    const totalApps = await this.appRepo.loadAll();

    // Then load product data from all app directories
    const apps = this.getAllApps();
    const appDirectories = new Set<string>();
    apps.forEach(app => {
      if (app.directory) {
        appDirectories.add(app.directory);
      }
    });

    let totalFunctions = 0;
    let totalWorkflows = 0;
    let totalStreams = 0;
    let totalBusinessObjects = 0;

    for (const appDir of appDirectories) {
      // Load from each app directory
      totalFunctions += await this.loadFromDirectory(this.functionRepo, appDir, 'functions');
      totalWorkflows += await this.loadFromDirectory(this.workflowRepo, appDir, 'workflows');
      totalStreams += await this.loadFromDirectory(this.streamRepo, appDir, 'streams');
      totalBusinessObjects += await this.loadFromDirectory(this.businessObjectRepo, appDir, 'business-objects');
    }

    logger.info(
      `Total loaded: ${totalFunctions} functions, ${totalWorkflows} workflows, ${totalStreams} streams, ${totalBusinessObjects} business objects, ${totalProjects} projects, ${totalApps} apps`
    );

    this.buildEdges();
    this.indexEvents();
  }

  private async loadFromDirectory<T>(
    repo: BaseRepository<T>,
    appDirectory: string,
    subdirectory: string
  ): Promise<number> {
    const entityPath = path.resolve(appDirectory, subdirectory);
    if (!this.fileSystem.directoryExists(entityPath)) {
      return 0;
    }

    const files = this.fileSystem.getAllYamlFiles(entityPath);
    for (const file of files) {
      await repo.loadFile(file);
    }
    return files.length;
  }

  /**
   * Index events from functions
   */
  private indexEvents() {
    const functions = this.store.getTable('functions');

    for (const funcData of Object.values(functions)) {
      const emits = JSON.parse((funcData.emits as string) || '[]') as string[];
      const consumes = JSON.parse((funcData.consumes as string) || '[]') as string[];

      for (const event of emits) {
        this.store.setRow('events', event, { name: event });
      }

      for (const event of consumes) {
        this.store.setRow('events', event, { name: event });
      }
    }
  }

  /**
   * Build edges between functions based on events
   */
  private buildEdges() {
    // Clear existing edges
    this.store.delTable('edges');

    const functions = this.store.getTable('functions');

    for (const [funcId, funcData] of Object.entries(functions)) {
      const emits = JSON.parse((funcData.emits as string) || '[]') as string[];

      for (const event of emits) {
        // Find all functions that consume this event
        for (const [targetId, targetData] of Object.entries(functions)) {
          const consumes = JSON.parse((targetData.consumes as string) || '[]') as string[];

          if (consumes.includes(event)) {
            const edgeId = `${funcId}:${event}:${targetId}`;
            this.store.setRow('edges', edgeId, {
              source: funcId,
              target: targetId,
              event,
            });
          }
        }
      }
    }

    logger.debug('Built edges', { count: Object.keys(this.store.getTable('edges')).length });
  }

  /**
   * Setup file watcher
   */
  private setupWatcher() {
    const watchPaths: string[] = [
      `${path.resolve(CONFIG_ROOT, 'projects')}/**/*.{yml,yaml}`,
      `${path.resolve(CONFIG_ROOT, 'apps')}/**/*.{yml,yaml}`,
    ];

    // Add watch paths from all app directories
    const apps = this.getAllApps();
    const appDirectories = new Set<string>();
    apps.forEach(app => {
      if (app.directory) {
        appDirectories.add(app.directory);
      }
    });

    for (const appDir of appDirectories) {
      watchPaths.push(
        `${path.resolve(appDir, 'functions')}/**/*.{yml,yaml}`,
        `${path.resolve(appDir, 'workflows')}/**/*.{yml,yaml}`,
        `${path.resolve(appDir, 'streams')}/**/*.{yml,yaml}`,
        `${path.resolve(appDir, 'business-objects')}/**/*.{yml,yaml}`
      );
    }

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('add', async (filePath) => {
      logger.info('File added', { filePath });
      await this.reloadFile(filePath);
      this.buildEdges();
      this.indexEvents();
    });

    this.watcher.on('change', async (filePath) => {
      logger.info('File changed', { filePath });
      await this.reloadFile(filePath);
      this.buildEdges();
      this.indexEvents();
    });

    this.watcher.on('unlink', (filePath) => {
      logger.info('File removed', { filePath });
      this.removeFileFromStore(filePath);
      this.buildEdges();
      this.indexEvents();
    });
  }

  /**
   * Reload file using appropriate repository
   */
  private async reloadFile(filePath: string) {
    if (filePath.includes('/functions/')) {
      await this.functionRepo.loadFile(filePath);
    } else if (filePath.includes('/workflows/')) {
      await this.workflowRepo.loadFile(filePath);
    } else if (filePath.includes('/streams/')) {
      await this.streamRepo.loadFile(filePath);
    } else if (filePath.includes('/business-objects/')) {
      await this.businessObjectRepo.loadFile(filePath);
    } else if (filePath.includes('/projects/')) {
      await this.projectRepo.loadFile(filePath);
    } else if (filePath.includes('/apps/')) {
      await this.appRepo.loadFile(filePath);
    }
  }

  /**
   * Remove file from store using appropriate repository
   */
  private removeFileFromStore(filePath: string) {
    if (filePath.includes('/functions/')) {
      this.functionRepo.removeByFilePath(filePath);
    } else if (filePath.includes('/workflows/')) {
      this.workflowRepo.removeByFilePath(filePath);
    } else if (filePath.includes('/streams/')) {
      this.streamRepo.removeByFilePath(filePath);
    } else if (filePath.includes('/business-objects/')) {
      this.businessObjectRepo.removeByFilePath(filePath);
    } else if (filePath.includes('/projects/')) {
      this.projectRepo.removeByFilePath(filePath);
    } else if (filePath.includes('/apps/')) {
      this.appRepo.removeByFilePath(filePath);
    }
  }

  // ===== Public API =====

  // Functions
  getAll(): FunctionCard[] {
    return this.functionRepo.getAll();
  }

  getById(id: string): FunctionCard | null {
    return this.functionRepo.getById(id);
  }

  async save(data: FunctionCard, targetRoot?: string) {
    const result = await this.functionRepo.save(data, targetRoot!);
    if (result.success) {
      this.buildEdges();
      this.indexEvents();
    }
    return result;
  }

  getFilePathById(id: string): string | null {
    const row = this.store.getRow('functions', id);
    if (!row || !row.filePath) return null;
    return row.filePath as string;
  }

  // Workflows
  getAllWorkflows(): Workflow[] {
    return this.workflowRepo.getAll();
  }

  getWorkflowById(id: string): Workflow | null {
    return this.workflowRepo.getById(id);
  }

  async saveWorkflow(data: Workflow, targetRoot?: string) {
    return await this.workflowRepo.save(data, targetRoot!);
  }

  // Streams
  getAllStreams(): Stream[] {
    return this.streamRepo.getAll();
  }

  getStreamById(id: string): Stream | null {
    return this.streamRepo.getById(id);
  }

  async saveStream(data: Stream, targetRoot?: string) {
    return await this.streamRepo.save(data, targetRoot!);
  }

  // Business Objects
  getAllBusinessObjects(): BusinessObject[] {
    return this.businessObjectRepo.getAll();
  }

  getBusinessObjectById(id: string): BusinessObject | null {
    return this.businessObjectRepo.getById(id);
  }

  async saveBusinessObject(data: BusinessObject, targetRoot?: string) {
    return await this.businessObjectRepo.save(data, targetRoot!);
  }

  // Edges and Events
  getEdges() {
    return Object.values(this.store.getTable('edges'));
  }

  // Roots - get all unique app directories
  getRoots(): string[] {
    const apps = this.getAllApps();
    const roots = new Set<string>();
    apps.forEach(app => {
      if (app.directory) {
        roots.add(app.directory);
      }
    });
    return Array.from(roots);
  }

  getRootForFilePath(filePath: string): string | null {
    const resolved = path.resolve(filePath);
    const subdirectories = ['functions', 'workflows', 'streams', 'business-objects'];
    
    // Check all app directories
    const apps = this.getAllApps();
    for (const app of apps) {
      if (!app.directory) continue;
      
      for (const subdirectory of subdirectories) {
        const targetPath = path.resolve(app.directory, subdirectory);
        if (resolved.startsWith(targetPath)) {
          return app.directory;
        }
      }
    }
    return null;
  }

  private getFilePath(tableName: string, id: string): string | null {
    const row = this.store.getRow(tableName, id);
    if (!row || !row.filePath) {
      return null;
    }
    return row.filePath as string;
  }

  private deleteRowFile(tableName: string, id: string): boolean {
    const filePath = this.getFilePath(tableName, id);
    if (!filePath) {
      return false;
    }
    const deleted = this.fileSystem.deleteFile(filePath);
    if (deleted) {
      this.store.delRow(tableName, id);
    }
    return deleted;
  }

  destroy() {
    if (this.watcher) {
      this.watcher.close();
    }
  }

  // Projects
  getAllProjects(): Project[] {
    return this.projectRepo.getAll();
  }

  getProjectById(id: string): Project | null {
    return this.projectRepo.getById(id);
  }

  async saveProject(data: Project, targetRoot?: string) {
    const root = targetRoot ?? CONFIG_ROOT;
    return await this.projectRepo.save(data, root);
  }

  async deleteProject(id: string) {
    return this.deleteRowFile('projects', id);
  }

  // Apps
  getAllApps(): AppEntity[] {
    return this.appRepo.getAll();
  }

  getAppById(id: string): AppEntity | null {
    return this.appRepo.getById(id);
  }

  async saveApp(data: AppEntity, targetRoot?: string) {
    // App config files are always saved to CONFIG_ROOT/apps/
    // The directory field in AppEntity is just metadata (where app codebase lives)
    return await this.appRepo.save(data, CONFIG_ROOT);
  }

  async deleteApp(id: string) {
    return this.deleteRowFile('apps', id);
  }
}

// Singleton instance
let storage: FunctionStorage | null = null;

export async function getStorage(): Promise<FunctionStorage> {
  if (!storage) {
    storage = new FunctionStorage();
    await storage.initialize();
  }
  return storage;
}

export { FunctionStorage };
