import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { normalizeKind } from '../../../validation/model';
import { planIssues, type PlanChange } from '../../../validation/plan';

/** POST /api/validate-plan { changes: [{ kind, op?, data?, id?, component? }] }: issues the changes would add; nothing is written */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { changes?: unknown };
    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      return Response.json({ error: 'changes must be a non-empty array' }, { status: 400 });
    }
    const changes: PlanChange[] = [];
    for (const [i, raw] of body.changes.entries()) {
      const c = (raw ?? {}) as Record<string, unknown>;
      const kind = normalizeKind(c.kind);
      if (!kind) return Response.json({ error: `changes[${i}].kind must be feature, workflow or business_object` }, { status: 400 });
      const op = c.op === 'delete' ? 'delete' : 'upsert';
      if (op === 'delete' ? typeof c.id !== 'string' : typeof c.data !== 'object' || c.data === null) {
        return Response.json({ error: `changes[${i}]: ${op === 'delete' ? 'id' : 'data'} is required` }, { status: 400 });
      }
      changes.push({ kind, op, data: c.data, id: c.id as string | undefined, component: typeof c.component === 'string' ? c.component : undefined });
    }
    const storage = await getStorage();
    return Response.json(planIssues(storage.modelSnapshot(), changes));
  } catch (error) {
    logger.error('Failed to validate a plan', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
