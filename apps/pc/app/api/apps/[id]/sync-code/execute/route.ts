import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';
import {
  CodeSyncService,
  getCodeSyncState,
  updateCodeSyncState,
  deleteCodeSyncState,
} from '@/lib/sync/codeSyncService';
import { analyzeCode } from '@/lib/code/parser';
import * as path from 'path';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { syncId } = body;

    if (!syncId) {
      return NextResponse.json(
        { error: 'syncId is required' },
        { status: 400 }
      );
    }

    const state = getCodeSyncState(syncId);
    if (!state) {
      return NextResponse.json(
        { error: 'Sync state not found' },
        { status: 404 }
      );
    }

    if (state.appId !== id) {
      return NextResponse.json(
        { error: 'Sync state does not belong to this app' },
        { status: 403 }
      );
    }

    if (state.stage !== 'matching') {
      return NextResponse.json(
        { error: 'Sync is not in matching stage' },
        { status: 400 }
      );
    }

    const storage = await getStorage();
    const app = storage.getAppById(id);

    if (!app || !app.codeBasePath || !app.directory) {
      return NextResponse.json(
        { error: 'App configuration invalid' },
        { status: 400 }
      );
    }

    const syncService = new CodeSyncService(
      id,
      app.codeBasePath,
      app.directory,
      syncId
    );

    // Re-analyze code to get full analysis result
    const resolvedPath = path.isAbsolute(app.codeBasePath)
      ? path.resolve(app.codeBasePath)
      : path.resolve(process.cwd(), app.codeBasePath);
    
    const analysisResult = analyzeCode(resolvedPath);

    // Execute sync asynchronously
    syncService
      .executeSync(
        state.matchedFunctions,
        state.actions,
        analysisResult,
        (progress) => {
          updateCodeSyncState(syncId, {
            stage: progress.stage,
            progress,
          });
        }
      )
      .then(() => {
        updateCodeSyncState(syncId, {
          stage: 'completed',
          progress: {
            stage: 'completed',
            current: state.matchedFunctions.length,
            total: state.matchedFunctions.length,
            message: 'Synchronization completed successfully',
          },
        });
      })
      .catch((error) => {
        logger.error('Code sync execution failed', { error, syncId, appId: id });
        updateCodeSyncState(syncId, {
          stage: 'error',
          progress: {
            stage: 'error',
            current: 0,
            total: 1,
            error: error.message || 'Unknown error',
          },
        });
      });

    return NextResponse.json({
      success: true,
      message: 'Synchronization execution started',
    });
  } catch (error) {
    logger.error('Failed to execute code sync', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

