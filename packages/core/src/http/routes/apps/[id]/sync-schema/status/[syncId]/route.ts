import { getSyncState } from '../../../../../../../sync/syncService';
import logger from '../../../../../../../logger';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; syncId: string }> }
) {
  try {
    const { syncId } = await params;
    const state = getSyncState(syncId);

    if (!state) {
      return Response.json(
        { error: 'Sync state not found' },
        { status: 404 }
      );
    }

    // Convert Map to object for JSON serialization
    const actions: Record<string, string> = {};
    state.actions.forEach((value, key) => {
      actions[key] = value;
    });

    return Response.json({
      syncId: state.syncId,
      appId: state.appId,
      stage: state.stage,
      progress: state.progress,
      matchedObjects: state.matchedObjects,
      actions,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    });
  } catch (error) {
    logger.error('Failed to get sync status', { error });
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

