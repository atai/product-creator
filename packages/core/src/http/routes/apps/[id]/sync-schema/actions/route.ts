import { getSyncState, updateSyncState } from '../../../../../../sync/syncService';
import { SyncAction } from '../../../../../../sync/matcher';
import logger from '../../../../../../logger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { syncId, actions } = body;

    if (!syncId || !actions) {
      return Response.json(
        { error: 'syncId and actions are required' },
        { status: 400 }
      );
    }

    const state = getSyncState(syncId);
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
    Object.entries(actions as Record<string, SyncAction>).forEach(
      ([key, value]) => {
        actionsMap.set(key, value);
      }
    );

    updateSyncState(syncId, {
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { syncId, modelName, action } = body;

    if (!syncId || !modelName || !action) {
      return Response.json(
        { error: 'syncId, modelName, and action are required' },
        { status: 400 }
      );
    }

    const state = getSyncState(syncId);
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

    // Update single action
    state.actions.set(modelName, action as SyncAction);
    updateSyncState(syncId, {
      actions: state.actions,
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

