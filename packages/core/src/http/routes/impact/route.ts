import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { impactOf } from '../../../validation/plan';
import { normalizeKind } from '../../../validation/model';

/** GET /api/impact?kind=feature|business_object&id=…: features, workflows and objects affected by changing the entry */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const kind = normalizeKind(params.get('kind'));
    const id = params.get('id');
    if ((kind !== 'feature' && kind !== 'business_object') || !id) {
      return Response.json({ error: 'kind (feature or business_object) and id are required' }, { status: 400 });
    }
    const storage = await getStorage();
    return Response.json(impactOf(storage.modelSnapshot(), kind, id));
  } catch (error) {
    logger.error('Failed to compute impact', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
