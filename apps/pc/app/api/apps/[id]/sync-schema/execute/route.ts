import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';
import {
  SchemaSyncService,
  getSyncState,
  updateSyncState,
  deleteSyncState,
} from '@/lib/sync/syncService';

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

    const state = getSyncState(syncId);
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

    if (!app || !app.dbSchemaPath || !app.directory) {
      return NextResponse.json(
        { error: 'App configuration invalid' },
        { status: 400 }
      );
    }

    const syncService = new SchemaSyncService(
      id,
      app.dbSchemaPath,
      app.directory,
      syncId
    );

    // Execute sync asynchronously
    syncService
      .executeSync(
        state.matchedObjects,
        state.actions,
        (progress) => {
          updateSyncState(syncId, {
            stage: progress.stage,
            progress,
          });
        }
      )
      .then(() => {
        updateSyncState(syncId, {
          stage: 'completed',
          progress: {
            stage: 'completed',
            current: state.matchedObjects.length,
            total: state.matchedObjects.length,
            message: 'Synchronization completed successfully',
          },
        });
      })
      .catch((error) => {
        logger.error('Sync execution failed', { error, syncId, appId: id });
        updateSyncState(syncId, {
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
    logger.error('Failed to execute sync', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

