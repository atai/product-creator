import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { generateAppId } from '../../../utils/id';

export async function GET() {
  try {
    const storage = await getStorage();
    const apps = storage.getAllApps();
    return Response.json({ apps });
  } catch (error) {
    logger.error('Failed to list apps', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, projectId, id, directory, codeBasePath, dbSchemaPath } = body;

    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!projectId || typeof projectId !== 'string') {
      return Response.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!directory || typeof directory !== 'string') {
      return Response.json({ error: 'directory is required' }, { status: 400 });
    }

    const storage = await getStorage();
    const project = storage.getProjectById(projectId);
    if (!project) {
      return Response.json({ error: 'Project does not exist' }, { status: 400 });
    }

    // Note: directory is metadata (where app codebase lives), not restricted to roots
    // The app config file itself is always saved to CONFIG_ROOT/apps/

    const existingApps = storage.getAllApps();
    const existingIds = new Set(existingApps.map(app => app.id));

    let appId: string;
    if (id) {
      appId = String(id).toLowerCase();
      if (appId.split('-')[0] !== projectId) {
        return Response.json({ error: 'App ID must start with projectId-' }, { status: 400 });
      }
      if (!/^[a-z]{5}-[a-z]{3}$/.test(appId)) {
        return Response.json({ error: 'App ID must match <projectId>-<abc>' }, { status: 400 });
      }
      if (existingIds.has(appId)) {
        return Response.json({ error: 'App ID already exists' }, { status: 409 });
      }
    } else {
      appId = generateAppId(projectId, name, existingIds);
    }

    const payload = {
      id: appId,
      name: name.trim(),
      projectId,
      directory,
      codeBasePath: codeBasePath ? String(codeBasePath) : undefined,
      dbSchemaPath: dbSchemaPath ? String(dbSchemaPath) : undefined,
    };

    // Note: directory is metadata, app config is always saved to CONFIG_ROOT/apps/
    const result = await storage.saveApp(payload);
    if (!result.success) {
      return Response.json({ error: result.error || 'Failed to save app' }, { status: 500 });
    }

    logger.info('App created', { id: appId });
    return Response.json({ app: payload }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create app', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}




