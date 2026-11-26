import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { loadOpenApiSpec } from '../../../interfaces/openapi';

/** GET /api/interfaces?app=<appId> — OpenAPI operations of a service (or of all services) */
export async function GET(request: Request) {
  try {
    const storage = await getStorage();
    const appId = new URL(request.url).searchParams.get('app');
    const apps = storage.getAllApps().filter((a) => !appId || a.id === appId);
    const result = apps
      .filter((a) => a.openapi && a.openapi.length > 0)
      .map((a) => ({ appId: a.id, appName: a.name, projectId: a.projectId, specs: (a.openapi ?? []).map(loadOpenApiSpec) }));
    return Response.json(result);
  } catch (error) {
    logger.error('Failed to load interfaces', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
