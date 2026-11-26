import { getStorage } from '../../../storage';

export async function GET(request: Request) {
  try {
    const storage = await getStorage();
    const appId = new URL(request.url).searchParams.get('app');

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

    return Response.json(streams);
  } catch (error) {
    console.error('Failed to fetch streams', error);
    return Response.json({ error: 'Failed to fetch streams' }, { status: 500 });
  }
}
