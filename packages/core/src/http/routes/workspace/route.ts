import { getStorage } from '../../../storage';

/** GET /api/workspace — mode and opened projects/services */
export async function GET() {
  const storage = await getStorage();
  return Response.json({
    mode: storage.isManifestMode() ? 'desktop' : 'web',
    projects: storage.getAllProjects(),
    apps: storage.getAllApps(),
  });
}
