import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { countIssues, validateModel } from '../../../validation/model';

/** GET /api/validation?app=<component id>: model issues of the catalog (references are resolved across all projects) */
export async function GET(request: Request) {
  try {
    const appId = new URL(request.url).searchParams.get('app');
    const storage = await getStorage();
    const issues = validateModel(storage.modelSnapshot()).filter((i) => !appId || i.component === appId);
    return Response.json({ ...countIssues(issues), issues });
  } catch (error) {
    logger.error('Failed to validate the catalog', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
