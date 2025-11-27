import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';
import {
  SchemaSyncService,
  createSyncState,
  updateSyncState,
} from '@/lib/sync/syncService';

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

    if (!app.dbSchemaPath) {
      return NextResponse.json(
        { error: 'DB schema path is not set for this application' },
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
    const syncId = createSyncState(id, app.dbSchemaPath, app.directory);

    // Start loading schema in background
    const syncService = new SchemaSyncService(
      id,
      app.dbSchemaPath,
      app.directory,
      syncId
    );

    // Load schema asynchronously
    syncService
      .loadSchema((progress) => {
        updateSyncState(syncId, {
          stage: progress.stage,
          progress,
        });
      })
      .then((models) => {
        // After loading, start matching
        return syncService.matchObjects(models, (progress) => {
          updateSyncState(syncId, {
            stage: progress.stage,
            progress,
            matchedObjects: progress.matchedObjects || [],
          });
        });
      })
      .then((matchedObjects) => {
        updateSyncState(syncId, {
          stage: 'matching',
          matchedObjects,
          progress: {
            stage: 'matching',
            current: matchedObjects.length,
            total: matchedObjects.length,
            message: 'Matching completed',
            matchedObjects,
          },
        });
      })
      .catch((error) => {
        logger.error('Sync failed', { error, syncId, appId: id });
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
      syncId,
      message: 'Synchronization started',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Failed to start sync', { error: errorMessage, stack: errorStack, appId: id });
    
    // Try to create a sync state with error if we have an app ID
    if (id) {
      try {
        const syncId = createSyncState(id, '', '');
        updateSyncState(syncId, {
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
        logger.error('Failed to create error sync state', { error: e });
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

