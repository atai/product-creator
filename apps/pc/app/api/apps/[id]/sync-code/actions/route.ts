import { NextRequest, NextResponse } from 'next/server';
import { getCodeSyncState, updateCodeSyncState, getCodeSyncState as getState } from '@/lib/sync/codeSyncService';
import { SyncAction } from '@/lib/sync/codeMatcher';
import logger from '@/lib/logger';

/**
 * Save all actions for a sync session
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { syncId, actions } = body;

    if (!syncId) {
      return NextResponse.json(
        { error: 'syncId is required' },
        { status: 400 }
      );
    }

    if (!actions || typeof actions !== 'object') {
      return NextResponse.json(
        { error: 'actions object is required' },
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

    // Convert actions object to Map
    const actionsMap = new Map<string, SyncAction>();
    Object.entries(actions).forEach(([key, value]) => {
      if (['skip', 'update', 'create', 'delete'].includes(value as string)) {
        actionsMap.set(key, value as SyncAction);
      }
    });

    updateCodeSyncState(syncId, {
      actions: actionsMap,
    });

    return NextResponse.json({
      success: true,
      message: 'Actions saved',
    });
  } catch (error) {
    logger.error('Failed to save actions', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Update a single action for a function
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { syncId, functionKey, action } = body;

    if (!syncId) {
      return NextResponse.json(
        { error: 'syncId is required' },
        { status: 400 }
      );
    }

    if (!functionKey) {
      return NextResponse.json(
        { error: 'functionKey is required' },
        { status: 400 }
      );
    }

    if (!action || !['skip', 'update', 'create', 'delete'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be one of: skip, update, create, delete' },
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

    // Update the action in the map
    const actionsMap = new Map(state.actions);
    actionsMap.set(functionKey, action as SyncAction);
    
    updateCodeSyncState(syncId, {
      actions: actionsMap,
    });

    return NextResponse.json({
      success: true,
      message: 'Action updated',
    });
  } catch (error) {
    logger.error('Failed to update action', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

