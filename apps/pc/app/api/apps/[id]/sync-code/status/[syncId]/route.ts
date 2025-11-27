import { NextRequest, NextResponse } from 'next/server';
import { getCodeSyncState } from '@/lib/sync/codeSyncService';
import logger from '@/lib/logger';

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; syncId: string }> }
) {
  try {
    const { syncId, id } = await params;
    logger.debug('Code sync status requested', { syncId, appId: id });
    const state = getCodeSyncState(syncId);

    if (!state) {
      logger.warn('Code sync state not found in status endpoint', { syncId, appId: id });
      return NextResponse.json({ error: 'Sync state not found' }, { status: 404 });
    }

    // Convert Map to object for JSON serialization
    const actions: Record<string, string> = {};
    state.actions.forEach((value, key) => {
      actions[key] = value;
    });

    return NextResponse.json({
      syncId: state.syncId,
      stage: state.stage,
      progress: state.progress,
      matchedFunctions: state.matchedFunctions || [],
      actions,
    });
  } catch (error) {
    logger.error('Failed to get code sync status', { error, syncId: (await params).syncId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

