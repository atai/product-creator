import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';

export async function GET(request: NextRequest) {
  try {
    const storage = await getStorage();
    const appId = request.nextUrl.searchParams.get('app');

    let streams = storage.getAllStreams();

    if (appId) {
      const app = storage.getAppById(appId);
      if (app && app.directory) {
        const directory = app.directory;
        const streamsTable = storage['store'].getTable('streams');
        const filteredIds = Object.entries(streamsTable)
          .filter(([, data]: [string, unknown]) => {
            const row = data as Record<string, unknown>;
            const root = storage.getRootForFilePath(row.filePath as string);
            return root === directory;
          })
          .map(([id]) => id);

        streams = streams.filter(stream => filteredIds.includes(stream.stream));
      }
    }

    return NextResponse.json(streams);
  } catch (error) {
    console.error('Failed to fetch streams', error);
    return NextResponse.json({ error: 'Failed to fetch streams' }, { status: 500 });
  }
}
