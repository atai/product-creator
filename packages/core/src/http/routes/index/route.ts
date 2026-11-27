import { getStorage } from '../../../storage';
import logger from '../../../logger';

export async function GET(request: Request) {
  try {
    const storage = await getStorage();
    const searchParams = new URL(request.url).searchParams;
    const appId = searchParams.get('app');

    let functions = storage.getAllFeatures();

    // Filter by app if specified
    if (appId) {
      const app = storage.getAppById(appId);
      if (app && app.directory) {
        functions = storage.getFeaturesOfApp(appId);
        logger.info('Filtered features by app', { appId, directory: app.directory, count: functions.length });
      }
    }

    return Response.json(functions);
  } catch (error) {
    logger.error('Failed to fetch index', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
