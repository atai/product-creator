import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { findDuplicates } from '../../../validation/plan';
import { normalizeKind } from '../../../validation/model';

/** GET /api/duplicates?kind=&name=&id=: existing duplicates, or the entries a proposed name/id would duplicate */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const kind = params.get('kind') ? normalizeKind(params.get('kind')) : undefined;
    if (kind === null) return Response.json({ error: 'kind must be feature, workflow or business_object' }, { status: 400 });
    const storage = await getStorage();
    return Response.json(findDuplicates(storage.modelSnapshot(), { kind, name: params.get('name') ?? undefined, id: params.get('id') ?? undefined }));
  } catch (error) {
    logger.error('Failed to find duplicates', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
