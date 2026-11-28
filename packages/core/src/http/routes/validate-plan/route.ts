import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { parsePlanChanges, planIssues } from '../../../validation/plan';

/** POST /api/validate-plan { changes: [{ kind, op?, data?, id?, component? }] }: issues the changes would add; nothing is written */
export async function POST(request: Request) {
  try {
    const parsed = parsePlanChanges(await request.json());
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const storage = await getStorage();
    return Response.json(planIssues(storage.modelSnapshot(), parsed.changes));
  } catch (error) {
    logger.error('Failed to validate a plan', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
