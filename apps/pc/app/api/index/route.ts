import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const storage = await getStorage();
    const searchParams = request.nextUrl.searchParams;
    const appId = searchParams.get('app');

    let functions = storage.getAll();

    // Filter by app if specified
    if (appId) {
      const app = storage.getAppById(appId);
      if (app && app.directory) {
        const directory = app.directory;
        const functionsTable = storage['store'].getTable('functions');
        const filteredIds = Object.entries(functionsTable)
          .filter(([, data]: [string, unknown]) => {
            const row = data as Record<string, unknown>;
            const root = storage.getRootForFilePath(row.filePath as string);
            return root === directory;
          })
          .map(([id]) => id);

        functions = functions.filter(f => filteredIds.includes(f.id));
        logger.info('Filtered functions by app', { appId, directory, count: functions.length });
      }
    }

    return NextResponse.json(functions);
  } catch (error) {
    logger.error('Failed to fetch index', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
