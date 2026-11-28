import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { idOf } from '../../../validation/model';
import { parsePlanChanges, planIssues, type PlanChange } from '../../../validation/plan';

/**
 * POST /api/apply-plan { changes: [{ kind, op?, data?, id?, component? }] } (PRODUCTCREATOR-33)
 *
 * The plan is checked as a whole (same check as /api/validate-plan), so entries that reference each other can be
 * written together in any order. Nothing is written when the plan adds errors (400 with the issues). If a write
 * fails, the changes already made are rolled back. `component` (app id) is required for new entries.
 */
export async function POST(request: Request) {
  try {
    const parsed = parsePlanChanges(await request.json());
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const storage = await getStorage();

    // where every entry goes: the given component, or where it is now
    const steps: { change: PlanChange; id: string; root: string | null; previous: unknown; previousRoot: string | null }[] = [];
    for (const [i, change] of parsed.changes.entries()) {
      const id = change.op === 'delete' ? String(change.id) : idOf(change.kind, change.data);
      const previous = storage.getEntry(change.kind, id);
      const previousRoot = previous ? storage.getEntryRoot(change.kind, id) : null;
      if (change.op === 'delete') {
        if (!previous) return Response.json({ error: `changes[${i}]: ${change.kind} "${id}" does not exist` }, { status: 400 });
        steps.push({ change, id, root: null, previous, previousRoot });
        continue;
      }
      const app = change.component ? storage.getAppById(change.component) : null;
      if (change.component && !app?.directory) return Response.json({ error: `changes[${i}]: component "${change.component}" not found` }, { status: 400 });
      const root = app?.directory ?? previousRoot;
      if (!root) return Response.json({ error: `changes[${i}]: component is required for the new ${change.kind} "${id}"` }, { status: 400 });
      steps.push({ change: { ...change, component: change.component ?? storage.getAppIdForFilePath(root) }, id, root, previous, previousRoot });
    }

    const plan = planIssues(storage.modelSnapshot(), steps.map((s) => s.change));
    if (!plan.ok) {
      const errors = plan.introduced.filter((i) => i.severity === 'error');
      return Response.json({ error: `Plan rejected: ${errors.length} error(s), nothing was written`, issues: errors, warnings: plan.introduced.filter((i) => i.severity === 'warning') }, { status: 400 });
    }

    const done: typeof steps = [];
    try {
      for (const step of steps) {
        if (step.change.op === 'delete') {
          if (!storage.deleteEntry(step.change.kind, step.id)) throw new Error(`could not delete ${step.change.kind} "${step.id}"`);
        } else {
          const result = await storage.saveEntry(step.change.kind, step.change.data, step.root as string);
          if (!result.success) throw new Error(`could not write ${step.change.kind} "${step.id}": ${result.error ?? 'unknown error'}`);
        }
        done.push(step);
      }
    } catch (error) {
      // roll back in reverse order: restore what was there before, remove what was new
      for (const step of done.reverse()) {
        try {
          if (step.previous && step.previousRoot) await storage.saveEntry(step.change.kind, step.previous, step.previousRoot);
          else storage.deleteEntry(step.change.kind, step.id);
        } catch (rollbackError) {
          logger.error('Rollback of an apply-plan step failed', { kind: step.change.kind, id: step.id, rollbackError });
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Apply-plan failed, rolled back', { message });
      return Response.json({ error: `Plan not applied (rolled back): ${message}` }, { status: 500 });
    }

    return Response.json({
      ok: true,
      applied: steps.map((s) => ({ kind: s.change.kind, op: s.change.op ?? 'upsert', id: s.id, created: !s.previous && s.change.op !== 'delete' })),
      warnings: plan.introduced.filter((i) => i.severity === 'warning'),
    });
  } catch (error) {
    logger.error('Failed to apply a plan', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
