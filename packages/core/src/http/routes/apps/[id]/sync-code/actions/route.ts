import { getCodeSyncState, updateCodeSyncState } from '../../../../../../sync/codeSyncService';
import { SyncAction } from '../../../../../../sync/codeMatcher';
import logger from '../../../../../../logger';

/**
 * Save all actions for a sync session
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { syncId, actions } = body;

    if (!syncId) {
      return Response.json(
        { error: 'syncId is required' },
        { status: 400 }
      );
    }

    if (!actions || typeof actions !== 'object') {
      return Response.json(
        { error: 'actions object is required' },
        { status: 400 }
      );
    }

    const state = getCodeSyncState(syncId);
    if (!state) {
      return Response.json(
        { error: 'Sync state not found' },
        { status: 404 }
      );
    }

    if (state.appId !== id) {
      return Response.json(
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

    return Response.json({
      success: true,
      message: 'Actions saved',
    });
  } catch (error) {
    logger.error('Failed to save actions', { error });
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Update a single action for a function
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { syncId, functionKey, action } = body;

    if (!syncId) {
      return Response.json(
        { error: 'syncId is required' },
        { status: 400 }
      );
    }

    if (!functionKey) {
      return Response.json(
        { error: 'functionKey is required' },
        { status: 400 }
      );
    }

    if (!action || !['skip', 'update', 'create', 'delete'].includes(action)) {
      return Response.json(
        { error: 'Invalid action. Must be one of: skip, update, create, delete' },
        { status: 400 }
      );
    }

    const state = getCodeSyncState(syncId);
    if (!state) {
      return Response.json(
        { error: 'Sync state not found' },
        { status: 404 }
      );
    }

    if (state.appId !== id) {
      return Response.json(
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

    return Response.json({
      success: true,
      message: 'Action updated',
    });
  } catch (error) {
    logger.error('Failed to update action', { error });
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

