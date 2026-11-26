import { analyzeCode, findTypeScriptFiles } from '../code/parser';
import { CodeAnalysisResult, ExportedFunction } from '../code/types';
import { FunctionCard } from '../types';
import { matchCodeToFunctions, MatchedFunction, SyncAction } from './codeMatcher';
import { loadSyncMapping, saveSyncMapping, updateMappingEntry } from './mappingStorage';
import { getStorage } from '../storage';
import * as path from 'path';
import * as fs from 'fs';
import logger from '../logger';
import { SyncStage } from './syncService';

/**
 * Progress callback
 */
export type ProgressCallback = (progress: CodeSyncProgress) => void;

/**
 * Code sync progress information
 */
export interface CodeSyncProgress {
  stage: SyncStage;
  current: number;
  total: number;
  message?: string;
  matchedFunctions?: MatchedFunction[];
  error?: string;
}

/**
 * Code sync state stored in memory (for status polling)
 */
interface CodeSyncState {
  syncId: string;
  appId: string;
  stage: SyncStage;
  progress: CodeSyncProgress;
  matchedFunctions: MatchedFunction[];
  actions: Map<string, SyncAction>; // Map of functionKey -> action
  createdAt: number;
  updatedAt: number;
}

// In-memory storage for code sync states
// Use global object to survive HMR (Hot Module Reload) in Next.js dev mode
declare global {
  // eslint-disable-next-line no-var
  var __codeSyncStates: Map<string, CodeSyncState> | undefined;
}

const getCodeSyncStatesMap = (): Map<string, CodeSyncState> => {
  if (!global.__codeSyncStates) {
    global.__codeSyncStates = new Map<string, CodeSyncState>();
    logger.info('Initialized global code sync states map');
  }
  return global.__codeSyncStates;
};

/**
 * Create a new code sync state
 */
export function createCodeSyncState(
  appId: string,
  codeBasePath: string,
  functionsDirectory: string
): string {
  const syncId = `code-sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const state: CodeSyncState = {
    syncId,
    appId,
    stage: 'loading',
    progress: {
      stage: 'loading',
      current: 0,
      total: 1,
    },
    matchedFunctions: [],
    actions: new Map(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const statesMap = getCodeSyncStatesMap();
  statesMap.set(syncId, state);
  logger.info('Code sync state created', { 
    syncId, 
    appId, 
    totalStates: statesMap.size,
    allSyncIds: Array.from(statesMap.keys())
  });
  return syncId;
}

/**
 * Get code sync state
 */
export function getCodeSyncState(syncId: string): CodeSyncState | null {
  const statesMap = getCodeSyncStatesMap();
  const state = statesMap.get(syncId);
  if (!state) {
    logger.warn('Code sync state not found', { 
      syncId, 
      totalStates: statesMap.size,
      allSyncIds: Array.from(statesMap.keys())
    });
  }
  return state || null;
}

/**
 * Update code sync state
 */
export function updateCodeSyncState(syncId: string, updates: Partial<CodeSyncState>): void {
  const statesMap = getCodeSyncStatesMap();
  const state = statesMap.get(syncId);
  if (state) {
    Object.assign(state, updates);
    state.updatedAt = Date.now();
    logger.debug('Code sync state updated', { 
      syncId, 
      stage: updates.stage || state.stage,
      hasMatchedFunctions: updates.matchedFunctions ? updates.matchedFunctions.length : state.matchedFunctions.length 
    });
  } else {
    logger.warn('Attempted to update non-existent code sync state', { syncId });
  }
}

/**
 * Delete code sync state
 */
export function deleteCodeSyncState(syncId: string): void {
  const statesMap = getCodeSyncStatesMap();
  statesMap.delete(syncId);
}

/**
 * Code Sync Service
 */
export class CodeSyncService {
  private appId: string;
  private codeBasePath: string;
  private functionsDirectory: string;
  private syncId: string;

  constructor(appId: string, codeBasePath: string, functionsDirectory: string, syncId: string) {
    this.appId = appId;
    this.codeBasePath = codeBasePath;
    this.functionsDirectory = functionsDirectory;
    this.syncId = syncId;
  }

  /**
   * Load and parse TypeScript code
   */
  async loadCode(progressCallback?: ProgressCallback): Promise<CodeAnalysisResult> {
    try {
      progressCallback?.({
        stage: 'loading',
        current: 0,
        total: 1,
        message: 'Scanning TypeScript files...',
      });

      // Resolve code base path
      const resolvedPath = path.isAbsolute(this.codeBasePath)
        ? path.resolve(this.codeBasePath)
        : path.resolve(process.cwd(), this.codeBasePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Code base path does not exist: ${resolvedPath}`);
      }

      // Find files first
      progressCallback?.({
        stage: 'loading',
        current: 0.2,
        total: 1,
        message: 'Scanning for TypeScript files...',
      });

      const tsFiles = findTypeScriptFiles(resolvedPath, resolvedPath);
      logger.info('Found TypeScript files', { count: tsFiles.length, appId: this.appId });

      progressCallback?.({
        stage: 'loading',
        current: 0.3,
        total: 1,
        message: `Found ${tsFiles.length} TypeScript files. Parsing...`,
      });

      // Analyze code - this may take time for large projects
      // Yield to event loop periodically to allow UI updates
      let analysisResult: CodeAnalysisResult;
      try {
        // Use setTimeout to yield to event loop before heavy computation
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        
        logger.info('Starting code analysis', { fileCount: tsFiles.length, appId: this.appId });
        analysisResult = analyzeCode(resolvedPath);
        logger.info('Code analysis completed', { 
          functionsFound: analysisResult.allExportedFunctions.length,
          filesParsed: analysisResult.files.length,
          appId: this.appId 
        });
      } catch (error) {
        logger.error('Failed to analyze code', { error, resolvedPath, appId: this.appId });
        throw error;
      }

      progressCallback?.({
        stage: 'loading',
        current: 0.7,
        total: 1,
        message: `Found ${analysisResult.allExportedFunctions.length} exported functions`,
      });

      progressCallback?.({
        stage: 'loading',
        current: 1,
        total: 1,
        message: `Analysis complete: ${analysisResult.files.length} files, ${analysisResult.allExportedFunctions.length} functions`,
      });

      logger.info('loadCode completed successfully', {
        appId: this.appId,
        filesCount: analysisResult.files.length,
        functionsCount: analysisResult.allExportedFunctions.length,
      });

      return analysisResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Failed to load code', { 
        error: errorMessage,
        stack: errorStack,
        appId: this.appId 
      });
      throw error;
    }
  }

  /**
   * Match exported functions with existing function cards
   */
  async matchFunctions(
    analysisResult: CodeAnalysisResult,
    progressCallback?: ProgressCallback
  ): Promise<MatchedFunction[]> {
    try {
      progressCallback?.({
        stage: 'matching',
        current: 0,
        total: analysisResult.allExportedFunctions.length,
        message: 'Loading existing functions...',
      });

      const storage = await getStorage();
      const existingFunctions = storage.getAll().filter((func) => {
        // Filter by app directory
        const filePath = storage.getFilePathById(func.id);
        if (!filePath) return false;
        const root = storage.getRootForFilePath(filePath);
        return root === this.functionsDirectory;
      });

      progressCallback?.({
        stage: 'matching',
        current: 0.3,
        total: analysisResult.allExportedFunctions.length,
        message: 'Loading sync mapping...',
      });

      const mapping = loadSyncMapping(this.functionsDirectory);

      progressCallback?.({
        stage: 'matching',
        current: 0.5,
        total: analysisResult.allExportedFunctions.length,
        message: 'Matching functions...',
      });

      logger.info('About to match functions', {
        appId: this.appId,
        exportedFunctionsCount: analysisResult.allExportedFunctions.length,
        existingFunctionsCount: existingFunctions.length,
      });

      const matched = matchCodeToFunctions(
        analysisResult.allExportedFunctions,
        existingFunctions,
        mapping,
        this.functionsDirectory
      );

      logger.info('Functions matched', {
        appId: this.appId,
        matchedCount: matched.length,
      });

      progressCallback?.({
        stage: 'matching',
        current: analysisResult.allExportedFunctions.length,
        total: analysisResult.allExportedFunctions.length,
        message: `Matched ${matched.length} functions`,
        matchedFunctions: matched,
      });

      return matched;
    } catch (error) {
      logger.error('Failed to match functions', { error, appId: this.appId });
      throw error;
    }
  }

  /**
   * Execute sync actions
   */
  async executeSync(
    matchedFunctions: MatchedFunction[],
    actions: Map<string, SyncAction>,
    analysisResult: CodeAnalysisResult,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    try {
      const storage = await getStorage();
      const total = matchedFunctions.length;
      let current = 0;

      for (const matched of matchedFunctions) {
        const functionName = matched.exportedFunction.name;
        const mappingKey = `${matched.exportedFunction.relativePath}:${functionName}`;
        const action = actions.get(mappingKey) || matched.action;

        current++;
        progressCallback?.({
          stage: 'executing',
          current,
          total,
          message: `Processing ${functionName} (${action})...`,
        });

        try {
          switch (action) {
            case 'create':
              await this.createFunction(matched.exportedFunction, analysisResult);
              updateMappingEntry(
                this.functionsDirectory,
                mappingKey,
                matched.functionId ||
                  this.generateFunctionId(matched.exportedFunction) ||
                  this.generateDefaultId(matched.exportedFunction),
                'create'
              );
              break;

            case 'update':
              if (matched.functionCard) {
                await this.updateFunction(matched.exportedFunction, matched.functionCard, analysisResult);
                updateMappingEntry(
                  this.functionsDirectory,
                  mappingKey,
                  matched.functionCard.id,
                  'update'
                );
              }
              break;

            case 'delete':
              if (matched.functionCard) {
                await this.deleteFunction(matched.functionCard);
                // Remove from mapping
                const mapping = loadSyncMapping(this.functionsDirectory);
                delete mapping[mappingKey];
                saveSyncMapping(this.functionsDirectory, mapping);
              }
              break;

            case 'skip':
              // No action needed, but update lastSync timestamp
              if (matched.functionCard) {
                updateMappingEntry(
                  this.functionsDirectory,
                  mappingKey,
                  matched.functionCard.id,
                  'skip'
                );
              }
              break;
          }
        } catch (error) {
          logger.error(`Failed to ${action} function ${functionName}`, { error });
          // Continue with next function
        }
      }

      progressCallback?.({
        stage: 'completed',
        current: total,
        total,
        message: 'Synchronization completed',
      });
    } catch (error) {
      logger.error('Failed to execute sync', { error, appId: this.appId });
      throw error;
    }
  }

  /**
   * Create function card from exported function
   */
  private async createFunction(
    exportedFunc: ExportedFunction,
    analysisResult: CodeAnalysisResult
  ): Promise<void> {
    try {
      const storage = await getStorage();
      const functionCard = this.convertExportedFunctionToFunctionCard(exportedFunc, analysisResult);
      const result = await storage.save(functionCard, this.functionsDirectory);
      if (!result.success) {
        throw new Error(result.error || `Failed to save function ${functionCard.id}`);
      }
    } catch (error) {
      logger.error(`Failed to create function from exported function ${exportedFunc.name}`, { error });
      throw error;
    }
  }

  /**
   * Update existing function card from exported function
   */
  private async updateFunction(
    exportedFunc: ExportedFunction,
    existingCard: FunctionCard,
    analysisResult: CodeAnalysisResult
  ): Promise<void> {
    try {
      const storage = await getStorage();
      const updatedCard = this.convertExportedFunctionToFunctionCard(exportedFunc, analysisResult, existingCard);
      const result = await storage.save(updatedCard, this.functionsDirectory);
      if (!result.success) {
        throw new Error(result.error || `Failed to update function ${updatedCard.id}`);
      }
    } catch (error) {
      logger.error(`Failed to update function from exported function ${exportedFunc.name}`, { error });
      throw error;
    }
  }

  /**
   * Delete function (set lifecycle to removed)
   */
  private async deleteFunction(functionCard: FunctionCard): Promise<void> {
    try {
      const storage = await getStorage();
      const deletedCard: FunctionCard = {
        ...functionCard,
        lifecycle: 'removed',
      };
      const result = await storage.save(deletedCard, this.functionsDirectory);
      if (!result.success) {
        throw new Error(result.error || `Failed to delete function ${functionCard.id}`);
      }
    } catch (error) {
      logger.error(`Failed to delete function ${functionCard.id}`, { error });
      throw error;
    }
  }

  /**
   * Convert exported function to Function Card
   */
  private convertExportedFunctionToFunctionCard(
    exportedFunc: ExportedFunction,
    analysisResult: CodeAnalysisResult,
    existing?: FunctionCard
  ): FunctionCard {
    // Generate ID from file path or use existing
    const functionId = existing?.id || this.generateFunctionId(exportedFunc) || this.generateDefaultId(exportedFunc);
    
    // Extract bounded_context, entity, action from ID or file path
    const idParts = functionId.split('.');
    let bounded_context = existing?.bounded_context || idParts[0] || 'default';
    let entity = existing?.entity || idParts[1] || 'default';
    let action = existing?.action || idParts[2] || exportedFunc.name.toLowerCase();

    // Try to extract from file path
    const pathParts = exportedFunc.relativePath.replace(/\.ts$/, '').split(/[/\\]/);
    if (pathParts.length >= 3) {
      bounded_context = pathParts[pathParts.length - 3];
      entity = pathParts[pathParts.length - 2];
      action = pathParts[pathParts.length - 1];
    } else if (pathParts.length === 2) {
      bounded_context = pathParts[pathParts.length - 2];
      entity = pathParts[pathParts.length - 1];
      action = exportedFunc.name.toLowerCase();
    }

    // Get called functions
    const calledFunctions = analysisResult.functionDependencies.get(exportedFunc.name) || [];
    // Convert function names to function IDs (if they exist)
    const calls = calledFunctions
      .map((funcName) => {
        // Try to find the function ID
        const foundFunc = analysisResult.allExportedFunctions.find((f) => f.name === funcName);
        if (foundFunc) {
          return this.generateFunctionId(foundFunc) || this.generateDefaultId(foundFunc);
        }
        return null;
      })
      .filter((id): id is string => id !== null);

    return {
      id: functionId,
      name: existing?.name || exportedFunc.name,
      bounded_context,
      entity,
      action,
      owner: existing?.owner || 'System',
      lifecycle: existing?.lifecycle || 'draft',
      description: existing?.description || `Function extracted from ${exportedFunc.relativePath}`,
      tags: existing?.tags || [],
      emits: existing?.emits || [],
      consumes: existing?.consumes || [],
      apis: existing?.apis || [],
      calls: calls.length > 0 ? calls : undefined,
      source_file: exportedFunc.relativePath,
    };
  }

  /**
   * Generate function ID from exported function
   */
  private generateFunctionId(exportedFunc: ExportedFunction): string | null {
    const pathParts = exportedFunc.relativePath
      .replace(/\.ts$/, '')
      .split(/[/\\]/)
      .filter((p) => p && p !== 'src' && p !== 'lib' && p !== 'app');

    if (pathParts.length >= 3) {
      const context = pathParts[pathParts.length - 3];
      const entity = pathParts[pathParts.length - 2];
      const action = pathParts[pathParts.length - 1];
      return `${context}.${entity}.${action}`;
    } else if (pathParts.length === 2) {
      const context = pathParts[pathParts.length - 2];
      const entity = pathParts[pathParts.length - 1];
      const action = exportedFunc.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      return `${context}.${entity}.${action}`;
    }

    return null;
  }

  /**
   * Generate default ID when path structure doesn't match expected format
   */
  private generateDefaultId(exportedFunc: ExportedFunction): string {
    const funcName = exportedFunc.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const pathParts = exportedFunc.relativePath
      .replace(/\.ts$/, '')
      .split(/[/\\]/)
      .filter((p) => p && p !== 'src' && p !== 'lib' && p !== 'app' && p !== 'index');
    
    if (pathParts.length > 0) {
      const context = pathParts[0] || 'default';
      const entity = pathParts[pathParts.length - 1] || 'default';
      return `${context}.${entity}.${funcName}`;
    }
    
    return `default.default.${funcName}`;
  }
}

