import { createStore, Store } from 'tinybase';
import * as fs from 'fs';
import * as path from 'path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import logger from './logger';
import { Feature, Workflow, Stream, BusinessObject, Project, AppEntity } from './types';
import type { CatalogModel, ModelEntry } from './validation/model';
import { BaseRepository } from './repository/BaseRepository';
import { FileSystemAdapter } from './repository/FileSystemAdapter';
import {
  featureConfig,
  FEATURES_DIR,
  LEGACY_FEATURES_DIR,
  workflowConfig,
  streamConfig,
  businessObjectConfig,
  projectConfig,
  appConfig,
} from './repository/configs';

/**
 * Storage options.
 *
 * - Web mode (apps/pc): projects/apps are YAML files in `configRoot` (default: `<cwd>/config`).
 * - Desktop mode (apps/desktop): projects/apps (services) come from project manifests
 *   (`product-creator.yml` or repo discovery) and are passed in `manifest`.
 */
export interface StorageOptions {
  configRoot?: string;
  manifest?: {
    projects: Project[];
    apps: AppEntity[];
    /** Pseudo file path used as origin of manifest entities (for logging). */
    source?: string;
  };
}

const MANIFEST_READONLY_ERROR =
  'Projects and services are defined in product-creator.yml of the project folder; edit that file instead';

let storageOptions: StorageOptions = {};

/** Folders of a component catalog that hold entity YAML files */
const CATALOG_DIRS = [FEATURES_DIR, LEGACY_FEATURES_DIR, 'workflows', 'streams', 'business-objects'];

/** A YAML file of the features table: `<catalog>/features/…` or the old `<catalog>/functions/…` */
function isFeatureFile(filePath: string): boolean {
  return new RegExp(`[\\\\/](${FEATURES_DIR}|${LEGACY_FEATURES_DIR})[\\\\/]`).test(filePath);
}

/**
 * Refactored FunctionStorage using Repository Pattern
 * Single Responsibility: Coordination between repositories and file watching
 */
class FunctionStorage {
  private store: Store = createStore();
  private watcher: FSWatcher | null = null;
  private watcherReady: Promise<void> = Promise.resolve();

  /** Resolves when the file watcher has scanned the catalog folders (external edits are picked up from then on) */
  whenWatching(): Promise<void> {
    return this.watcherReady;
  }
  private initialized = false;

  private fileSystem: FileSystemAdapter;
  private featureRepo: BaseRepository<Feature>;
  private workflowRepo: BaseRepository<Workflow>;
  private streamRepo: BaseRepository<Stream>;
  private businessObjectRepo: BaseRepository<BusinessObject>;
  private projectRepo: BaseRepository<Project>;
  private appRepo: BaseRepository<AppEntity>;

  private configRoot: string;
  private manifest: StorageOptions['manifest'];

  constructor(options: StorageOptions = {}) {
    this.configRoot = options.configRoot ?? path.resolve(process.cwd(), 'config');
    this.manifest = options.manifest;
    // In manifest mode projects/apps are not loaded from (or saved to) config YAML files
    const CONFIG_ROOTS = this.manifest ? [] : [this.configRoot];
    this.fileSystem = new FileSystemAdapter();

    // Product repositories don't need roots - they use app.directory from config
    this.featureRepo = new BaseRepository(
      this.store,
      this.fileSystem,
      featureConfig,
      [],
      { trackSources: true }
    );

    this.workflowRepo = new BaseRepository(
      this.store,
      this.fileSystem,
      workflowConfig,
      [],
      { trackSources: true }
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
      [],
      { trackSources: true }
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

    logger.info('Initializing catalog storage');

    // Initialize tables
    this.store.setTables({
      features: {},
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
    logger.info('Catalog storage initialized');
  }

  private async loadAll() {
    // First load projects and apps from config
    let totalProjects = await this.projectRepo.loadAll();
    let totalApps = await this.appRepo.loadAll();
    if (this.manifest) {
      const source = this.manifest.source ?? 'product-creator.yml';
      this.manifest.projects.forEach((project) => this.projectRepo.loadData(project, source, false));
      this.manifest.apps.forEach((app) => this.appRepo.loadData(app, source, false));
      totalProjects = this.manifest.projects.length;
      totalApps = this.manifest.apps.length;
    }

    // Then load product data from all app directories
    const apps = this.getAllApps();
    const appDirectories = new Set<string>();
    apps.forEach(app => {
      if (app.directory) {
        appDirectories.add(app.directory);
      }
    });

    let totalFeatures = 0;
    let totalWorkflows = 0;
    let totalStreams = 0;
    let totalBusinessObjects = 0;

    for (const appDir of appDirectories) {
      // Load from each app directory
      // features/ plus the old folder name functions/ (read transparently until migrated, PRODUCTCREATOR-28)
      totalFeatures += await this.loadFromDirectory(this.featureRepo, appDir, LEGACY_FEATURES_DIR);
      totalFeatures += await this.loadFromDirectory(this.featureRepo, appDir, FEATURES_DIR);
      totalWorkflows += await this.loadFromDirectory(this.workflowRepo, appDir, 'workflows');
      totalStreams += await this.loadFromDirectory(this.streamRepo, appDir, 'streams');
      totalBusinessObjects += await this.loadFromDirectory(this.businessObjectRepo, appDir, 'business-objects');
    }

    logger.info(
      `Total loaded: ${totalFeatures} features, ${totalWorkflows} workflows, ${totalStreams} streams, ${totalBusinessObjects} business objects, ${totalProjects} projects, ${totalApps} apps`
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
    const functions = this.store.getTable('features');

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

    const functions = this.store.getTable('features');

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
    // chokidar 4 does not expand globs: watch the folders and keep only YAML files of the catalog folders
    const watchPaths: string[] = this.manifest
      ? []
      : [path.resolve(this.configRoot, 'projects'), path.resolve(this.configRoot, 'apps')];

    // Add watch paths from all app directories
    const apps = this.getAllApps();
    const appDirectories = new Set<string>();
    apps.forEach(app => {
      if (app.directory) {
        appDirectories.add(app.directory);
      }
    });

    // Watch the catalog folders of every app directory, also those created later (features/ after a migration)
    const isCatalogPath = (file: string): boolean =>
      [...appDirectories].some((dir) => {
        const rel = path.relative(dir, file);
        if (rel === '') return true;
        if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
        return CATALOG_DIRS.includes(rel.split(path.sep)[0]);
      });
    const configDirs = watchPaths.slice();
    watchPaths.push(...appDirectories);
    const existing = watchPaths.filter((p) => fs.existsSync(p));

    this.watcher = chokidar.watch(existing, {
      persistent: true,
      ignoreInitial: true,
      ignored: (file, stats) => {
        if (configDirs.some((dir) => file === dir || file.startsWith(dir + path.sep))) return Boolean(stats?.isFile() && !/\.ya?ml$/.test(file));
        if (!isCatalogPath(file)) return true;
        return Boolean(stats?.isFile() && !/\.ya?ml$/.test(file));
      },
    });

    this.watcherReady = new Promise((resolve) => this.watcher!.once('ready', () => resolve()));

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
    if (isFeatureFile(filePath)) {
      await this.featureRepo.loadFile(filePath);
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
    if (isFeatureFile(filePath)) {
      this.featureRepo.removeByFilePath(filePath);
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

  /** Stop watching files */
  async close() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  // ===== Public API =====

  // Features (PRODUCTCREATOR-28; getAll/getById/save keep their old names for existing callers)
  getAllFeatures(): Feature[] {
    return this.featureRepo.getAll();
  }

  getFeatureById(id: string): Feature | null {
    return this.featureRepo.getById(id);
  }

  async saveFeature(data: Feature, targetRoot?: string) {
    const result = await this.featureRepo.save(data, targetRoot!);
    if (result.success) {
      this.buildEdges();
      this.indexEvents();
    }
    return result;
  }

  /** @deprecated use getAllFeatures */
  getAll(): Feature[] {
    return this.getAllFeatures();
  }

  /** @deprecated use getFeatureById */
  getById(id: string): Feature | null {
    return this.getFeatureById(id);
  }

  /** @deprecated use saveFeature */
  async save(data: Feature, targetRoot?: string) {
    return this.saveFeature(data, targetRoot);
  }

  /** File of a feature (in features/ or the old functions/ folder) */
  getFilePathById(id: string): string | null {
    const row = this.store.getRow('features', id);
    if (!row || !row.filePath) return null;
    return row.filePath as string;
  }

  /** Features stored in the catalog folder of one app (component) */
  getFeaturesOfApp(appId: string): Feature[] {
    const app = this.getAppById(appId);
    if (!app?.directory) return [];
    return this.getAllFeatures().filter((f) => {
      const file = this.getFilePathById(f.id);
      return file ? this.getRootForFilePath(file) === app.directory : false;
    });
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

  /** Component (app) id of a catalog file */
  getAppIdForFilePath(filePath: string): string | undefined {
    const root = this.getRootForFilePath(filePath);
    return root ? this.getAllApps().find((a) => a.directory === root)?.id : undefined;
  }

  /** Catalog as plain entries with their file and component, for validation and plan checks (PRODUCTCREATOR-29) */
  modelSnapshot(): CatalogModel {
    const entries = <T,>(table: string, items: T[], idOf: (item: T) => string): ModelEntry<T>[] =>
      items.map((data) => {
        const file = this.getFilePath(table, idOf(data)) ?? undefined;
        return { data, file, component: file ? this.getAppIdForFilePath(file) : undefined };
      });
    const duplicates: CatalogModel['duplicates'] = [];
    const repos = [
      ['feature', this.featureRepo],
      ['workflow', this.workflowRepo],
      ['business_object', this.businessObjectRepo],
    ] as const;
    for (const [kind, repo] of repos) {
      for (const [id, files] of Object.entries(repo.getDuplicateSources())) duplicates.push({ kind, id, files });
    }
    return {
      features: entries('features', this.getAllFeatures(), (f) => f.id),
      workflows: entries('workflows', this.getAllWorkflows(), (w) => w.workflow),
      objects: entries('business_objects', this.getAllBusinessObjects(), (o) => o.id),
      duplicates,
    };
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
    const subdirectories = CATALOG_DIRS;
    
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

  /** True when projects/apps come from project manifests (desktop mode) */
  isManifestMode(): boolean {
    return Boolean(this.manifest);
  }

  async saveProject(data: Project, targetRoot?: string) {
    if (this.manifest) return { success: false, error: MANIFEST_READONLY_ERROR };
    const root = targetRoot ?? this.configRoot;
    return await this.projectRepo.save(data, root);
  }

  async deleteProject(id: string) {
    if (this.manifest) return { success: false, error: MANIFEST_READONLY_ERROR };
    return this.deleteRowFile('projects', id);
  }

  // Apps
  getAllApps(): AppEntity[] {
    return this.appRepo.getAll();
  }

  getAppById(id: string): AppEntity | null {
    return this.appRepo.getById(id);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async saveApp(data: AppEntity, targetRoot?: string) {
    if (this.manifest) return { success: false, error: MANIFEST_READONLY_ERROR };
    // App config files are always saved to <configRoot>/apps/
    // The directory field in AppEntity is just metadata (where app codebase lives)
    return await this.appRepo.save(data, this.configRoot);
  }

  async deleteApp(id: string) {
    if (this.manifest) return { success: false, error: MANIFEST_READONLY_ERROR };
    return this.deleteRowFile('apps', id);
  }
}

// Singleton instance
let storage: FunctionStorage | null = null;

let storagePromise: Promise<FunctionStorage> | null = null;

/** Configure the storage singleton. Takes effect on next getStorage() (call resetStorage() first if already initialized). */
export function configureStorage(options: StorageOptions) {
  storageOptions = options;
}

/** Close file watchers and drop the singleton (e.g. when the set of opened projects changes). */
export async function resetStorage() {
  const current = storage;
  storage = null;
  storagePromise = null;
  if (current) await current.close();
}

export async function getStorage(): Promise<FunctionStorage> {
  if (storage) return storage;
  if (!storagePromise) {
    storagePromise = (async () => {
      const instance = new FunctionStorage(storageOptions);
      await instance.initialize();
      storage = instance;
      return instance;
    })();
  }
  return storagePromise;
}

export { FunctionStorage };
