import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';
import {
  CodeSyncService,
  createCodeSyncState,
  updateCodeSyncState,
  getCodeSyncState,
} from '@/lib/sync/codeSyncService';

export async function POST(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  try {
    id = (await params).id;
    const storage = await getStorage();
    const app = storage.getAppById(id);

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    if (!app.codeBasePath) {
      return NextResponse.json(
        { error: 'Code base path is not set for this application' },
        { status: 400 }
      );
    }

    if (!app.directory) {
      return NextResponse.json(
        { error: 'Directory is not set for this application' },
        { status: 400 }
      );
    }

    // Create sync state
    const syncId = createCodeSyncState(id, app.codeBasePath, app.directory);

    // Start loading code in background
    const syncService = new CodeSyncService(
      id,
      app.codeBasePath,
      app.directory,
      syncId
    );

    // Load code asynchronously
    syncService
      .loadCode((progress) => {
        logger.info('Code sync progress', { syncId, stage: progress.stage, current: progress.current, total: progress.total, message: progress.message });
        updateCodeSyncState(syncId, {
          stage: progress.stage,
          progress,
        });
      })
      .then((analysisResult) => {
        logger.info('loadCode promise resolved', { 
          syncId, 
          hasResult: !!analysisResult,
          functionsCount: analysisResult?.allExportedFunctions.length || 0 
        });
        logger.info('Code analysis completed, starting matching', { 
          syncId, 
          functionsCount: analysisResult.allExportedFunctions.length,
          filesCount: analysisResult.files.length 
        });
        
        // Update state before starting matching to ensure it's preserved
        updateCodeSyncState(syncId, {
          stage: 'matching',
          progress: {
            stage: 'matching',
            current: 0,
            total: analysisResult.allExportedFunctions.length,
            message: 'Starting matching...',
          },
        });

        // After loading, start matching
        logger.info('About to call matchFunctions', { syncId });
        return syncService.matchFunctions(analysisResult, (progress) => {
          logger.info('Matching progress', { 
            syncId, 
            stage: progress.stage,
            current: progress.current,
            total: progress.total,
            message: progress.message 
          });
          updateCodeSyncState(syncId, {
            stage: progress.stage,
            progress,
            matchedFunctions: progress.matchedFunctions || [],
          });
        }).catch((error) => {
          logger.error('Error in matchFunctions', { 
            syncId, 
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          throw error;
        });
      })
      .then((matchedFunctions) => {
        logger.info('matchFunctions completed', { syncId, matchedCount: matchedFunctions?.length || 0 });
        // Only switch to matching stage if we have matched functions
        if (matchedFunctions && matchedFunctions.length > 0) {
          updateCodeSyncState(syncId, {
            stage: 'matching',
            matchedFunctions,
            progress: {
              stage: 'matching',
              current: matchedFunctions.length,
              total: matchedFunctions.length,
              message: 'Matching completed',
              matchedFunctions,
            },
          });
        } else {
          // Stay in loading stage if no functions found
          updateCodeSyncState(syncId, {
            stage: 'matching',
            matchedFunctions: [],
            progress: {
              stage: 'matching',
              current: 0,
              total: 0,
              message: 'No functions found',
              matchedFunctions: [],
            },
          });
        }
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error('Code sync failed', { 
          error: errorMessage, 
          stack: errorStack,
          syncId, 
          appId: id 
        });
        
        // Ensure state exists and is updated with error
        const currentState = getCodeSyncState(syncId);
        if (!currentState) {
          logger.error('Sync state was lost, recreating with error', { syncId });
          // Recreate state if it was lost
          const newSyncId = createCodeSyncState(id || '', app?.codeBasePath || '', app?.directory || '');
          updateCodeSyncState(newSyncId, {
            stage: 'error',
            progress: {
              stage: 'error',
              current: 0,
              total: 1,
              error: errorMessage,
              message: `Error: ${errorMessage}`,
            },
          });
        } else {
          updateCodeSyncState(syncId, {
            stage: 'error',
            progress: {
              stage: 'error',
              current: 0,
              total: 1,
              error: errorMessage,
              message: `Error: ${errorMessage}`,
            },
          });
        }
      });

    return NextResponse.json({
      success: true,
      syncId,
      message: 'Synchronization started',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Failed to start code sync', { error: errorMessage, stack: errorStack, appId: id });
    
    // Try to create a sync state with error if we have an app ID
    if (id) {
      try {
        const syncId = createCodeSyncState(id, '', '');
        updateCodeSyncState(syncId, {
          stage: 'error',
          progress: {
            stage: 'error',
            current: 0,
            total: 1,
            error: errorMessage,
          },
        });
        return NextResponse.json({
          success: false,
          error: errorMessage,
          syncId,
        }, { status: 500 });
      } catch (e) {
        logger.error('Failed to create error code sync state', { error: e });
      }
    }
    
    // If we can't create sync state, just return error
    return NextResponse.json(
      { 
        error: errorMessage || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}

