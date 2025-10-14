import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const storage = await getStorage();
    const searchParams = request.nextUrl.searchParams;
    const rootFilter = searchParams.get('root');

    let functions = storage.getAll();

    // Filter by root if specified
    if (rootFilter) {
      const functionsTable = storage['store'].getTable('functions');
      const filteredIds = Object.entries(functionsTable)
        .filter(([, data]: [string, unknown]) => {
          const row = data as Record<string, unknown>;
          const root = storage.getRootForFilePath(row.filePath as string);
          return root === rootFilter;
        })
        .map(([id]) => id);

      functions = functions.filter(f => filteredIds.includes(f.id));
      logger.info('Filtered functions by root', { rootFilter, count: functions.length });
    }

    return NextResponse.json(functions);
  } catch (error) {
    logger.error('Failed to fetch index', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
