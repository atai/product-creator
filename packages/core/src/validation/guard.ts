import type { FunctionStorage } from '../storage';
import type { EntityKind } from './model';
import { planIssues } from './plan';

/**
 * Save guard (PRODUCTCREATOR-29): a write is rejected when it adds model errors (unknown references, types,
 * duplicates, schema). Problems the entry already had do not block saving it, so existing catalogs stay editable.
 * Returns the 400 response, or null when the write may proceed.
 */
export function rejectInvalidSave(storage: FunctionStorage, kind: EntityKind, data: unknown, appId: string): Response | null {
  const plan = planIssues(storage.modelSnapshot(), [{ kind, data, component: appId }]);
  if (plan.ok) return null;
  const errors = plan.introduced.filter((i) => i.severity === 'error');
  return Response.json(
    { error: `Validation failed: ${errors.map((i) => i.message).join('; ')}`, issues: errors, warnings: plan.introduced.filter((i) => i.severity === 'warning') },
    { status: 400 }
  );
}
