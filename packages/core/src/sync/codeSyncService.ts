import { analyzeCode, findTypeScriptFiles } from '../code/parser';
import { CodeAnalysisResult, ExportedFunction } from '../code/types';
import { Feature } from '../types';
import { matchCodeToFunctions, MatchedFunction, normalizeCodeAction, suggestFeatureId, SyncAction } from './codeMatcher';
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
  _codeBasePath: string,
  _functionsDirectory: string
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
      const existingFunctions = storage.getAllFeatures().filter((func) => {
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
        this.functionsDirectory,
        analysisResult.files.map((f) => f.relativePath)
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
   * Execute sync actions (PRODUCTCREATOR-30): link sets the feature's source_file and calls, create adds a feature for a
   * candidate, unlink clears source_file of a stale feature. Features are never marked removed by the sync.
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
      const keyOf = (m: MatchedFunction) => `${m.exportedFunction.relativePath}:${m.exportedFunction.name}`;
      const actionOf = (m: MatchedFunction) => normalizeCodeAction(actions.get(keyOf(m)) || m.action);

      // code function name → feature it implements after this sync (for calls)
      const implementedBy = new Map<string, string>();
      for (const m of matchedFunctions) {
        const action = actionOf(m);
        if (m.status === 'stale') continue;
        if (action === 'create' && m.functionId) implementedBy.set(m.exportedFunction.name, suggestFeatureId(m.exportedFunction).id);
        else if (m.functionCard && (action === 'link' || (action === 'skip' && m.status === 'linked'))) implementedBy.set(m.exportedFunction.name, m.functionCard.id);
      }
      const callsOf = (fn: ExportedFunction, self: string) =>
        [...new Set((analysisResult.functionDependencies.get(fn.name) ?? []).map((n) => implementedBy.get(n)).filter((id): id is string => Boolean(id) && id !== self))];

      let current = 0;
      for (const matched of matchedFunctions) {
        const functionName = matched.exportedFunction.name;
        const mappingKey = keyOf(matched);
        const action = actionOf(matched);
        current++;
        progressCallback?.({ stage: 'executing', current, total, message: `Processing ${functionName} (${action})...` });

        try {
          if (action === 'link' && matched.functionCard) {
            const f = matched.functionCard;
            const calls = [...new Set([...(f.calls ?? []), ...callsOf(matched.exportedFunction, f.id)])];
            await this.saveFeature(storage, { ...f, source_file: matched.exportedFunction.relativePath, ...(calls.length ? { calls } : {}) });
            updateMappingEntry(this.functionsDirectory, mappingKey, f.id, 'link');
          } else if (action === 'create' && !matched.functionCard) {
            const feature = this.featureFromCode(matched.exportedFunction, callsOf(matched.exportedFunction, suggestFeatureId(matched.exportedFunction).id));
            if (storage.getFeatureById(feature.id)) throw new Error(`Feature ${feature.id} already exists; link it instead`);
            await this.saveFeature(storage, feature);
            updateMappingEntry(this.functionsDirectory, mappingKey, feature.id, 'create');
          } else if (action === 'unlink' && matched.functionCard) {
            const { source_file: _file, ...rest } = matched.functionCard;
            await this.saveFeature(storage, rest);
            const mapping = loadSyncMapping(this.functionsDirectory);
            for (const [key, entry] of Object.entries(mapping)) if (entry.businessObjectId === matched.functionCard.id) delete mapping[key];
            saveSyncMapping(this.functionsDirectory, mapping);
          } else if (action === 'skip' && matched.functionCard && matched.status === 'linked') {
            updateMappingEntry(this.functionsDirectory, mappingKey, matched.functionCard.id, 'skip');
          }
        } catch (error) {
          logger.error(`Failed to ${action} code function ${functionName}`, { error });
          // Continue with next function
        }
      }

      progressCallback?.({ stage: 'completed', current: total, total, message: 'Synchronization completed' });
    } catch (error) {
      logger.error('Failed to execute sync', { error, appId: this.appId });
      throw error;
    }
  }

  private async saveFeature(storage: Awaited<ReturnType<typeof getStorage>>, feature: Feature): Promise<void> {
    const result = await storage.saveFeature(feature, this.functionsDirectory);
    if (!result.success) throw new Error(result.error || `Failed to save feature ${feature.id}`);
  }

  /** A draft feature for a code function (action create); the id follows <bounded_context>.<entity>.<action> */
  private featureFromCode(fn: ExportedFunction, calls: string[]): Feature {
    const { id, bounded_context, entity, action } = suggestFeatureId(fn);
    return {
      id,
      name: fn.name,
      bounded_context,
      entity,
      action,
      owner: 'System',
      lifecycle: 'draft',
      description: `Created from the code function ${fn.name} in ${fn.relativePath}`,
      tags: [],
      emits: [],
      consumes: [],
      apis: [],
      ...(calls.length ? { calls } : {}),
      source_file: fn.relativePath,
    };
  }
}

