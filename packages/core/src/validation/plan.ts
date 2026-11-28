import type { BusinessObject, Feature, Workflow } from '../types';
import { stampTranslations } from '../i18n';
import { catalogSchemas } from './schemas';
import { idOf, normalizeKind, referencedType, typeKey, validateModel, type CatalogModel, type EntityKind, type ModelEntry, type ValidationIssue } from './model';

/**
 * Plan checks (PRODUCTCREATOR-29): what a proposed change would break, without writing anything.
 * Used by the save handlers (reject changes that add errors), the MCP tools validate_plan / impact_of_change /
 * find_duplicates and the UI.
 */

export interface PlanChange {
  kind: EntityKind;
  /** upsert (default): create or replace the entry with data's id; delete: remove the entry `id` */
  op?: 'upsert' | 'delete';
  data?: unknown;
  id?: string;
  /** Component (app id) the entry is written to; default: where it is now */
  component?: string;
}

export interface PlanResult {
  ok: boolean;
  /** Issues the change adds (errors here make `ok` false) */
  introduced: ValidationIssue[];
  /** Issues the changed entries already had before (informational, do not block) */
  existing: ValidationIssue[];
}

/** Request body `{ changes: [...] }` of /api/validate-plan and /api/apply-plan → changes, or the error to return (400) */
export function parsePlanChanges(body: unknown): { changes: PlanChange[] } | { error: string } {
  const raw = (body ?? {}) as { changes?: unknown };
  if (!Array.isArray(raw.changes) || raw.changes.length === 0) return { error: 'changes must be a non-empty array' };
  const changes: PlanChange[] = [];
  for (const [i, item] of raw.changes.entries()) {
    const c = (item ?? {}) as Record<string, unknown>;
    const kind = normalizeKind(c.kind);
    if (!kind) return { error: `changes[${i}].kind must be feature, workflow, business_object or stream` };
    const op = c.op === 'delete' ? 'delete' : 'upsert';
    if (op === 'delete' ? typeof c.id !== 'string' : typeof c.data !== 'object' || c.data === null) {
      return { error: `changes[${i}]: ${op === 'delete' ? 'id' : 'data'} is required` };
    }
    changes.push({ kind, op, data: c.data, id: c.id as string | undefined, component: typeof c.component === 'string' ? c.component : undefined });
  }
  return { changes };
}

const lists = (model: CatalogModel, kind: EntityKind): ModelEntry<unknown>[] =>
  (kind === 'feature' ? model.features : kind === 'workflow' ? model.workflows : kind === 'stream' ? (model.streams ?? []) : model.objects) as ModelEntry<unknown>[];

/** The model after the changes (a copy) */
export function applyPlan(model: CatalogModel, changes: PlanChange[]): CatalogModel {
  const next: CatalogModel = {
    // context (design checks) stays as it is
    ...model,
    features: [...model.features],
    workflows: [...model.workflows],
    objects: [...model.objects],
    streams: [...(model.streams ?? [])],
    duplicates: [...(model.duplicates ?? [])],
  };
  for (const change of changes) {
    const list = lists(next, change.kind);
    const id = change.op === 'delete' ? String(change.id ?? '') : idOf(change.kind, change.data);
    if (change.op === 'delete') {
      for (let i = list.length - 1; i >= 0; i--) if (idOf(change.kind, list[i].data) === id) list.splice(i, 1);
      next.duplicates = next.duplicates?.filter((d) => !(d.kind === change.kind && d.id === id));
      continue;
    }
    // ids are unique per kind: an upsert replaces the entry wherever it is; another component = a move (PRODUCTCREATOR-34)
    const index = list.findIndex((e) => idOf(change.kind, e.data) === id);
    // translations are stamped as the save does, so a plan is checked as it will be written (PRODUCTCREATOR-37)
    const data = stampTranslations(index >= 0 ? list[index].data : null, change.data, catalogSchemas[change.kind]);
    if (index >= 0) list[index] = { ...list[index], data, component: change.component ?? list[index].component };
    else list.push({ data, component: change.component });
  }
  return next;
}

const issueKey = (i: ValidationIssue) => [i.severity, i.code, i.kind, i.id, i.field ?? '', i.message].join('|');

export function planIssues(model: CatalogModel, changes: PlanChange[]): PlanResult {
  const before = validateModel(model);
  const after = validateModel(applyPlan(model, changes));
  const known = new Set(before.map(issueKey));
  const introduced = after.filter((i) => !known.has(issueKey(i)));
  const touched = new Set(changes.map((c) => `${c.kind}|${c.op === 'delete' ? c.id : idOf(c.kind, c.data)}`));
  const existing = after.filter((i) => known.has(issueKey(i)) && touched.has(`${i.kind}|${i.id}`));
  return { ok: !introduced.some((i) => i.severity === 'error'), introduced, existing };
}

export interface ImpactRef {
  id: string;
  name?: string;
  component?: string;
  /** Why it is affected, e.g. `objects: write`, `calls orders.order.create`, `steps[1]` */
  via: string;
}

export interface Impact {
  kind: 'feature' | 'business_object';
  id: string;
  exists: boolean;
  /** Features that use the object / call the feature (directly), then features that call those (one level) */
  features: ImpactRef[];
  /** Workflows containing an affected feature (or the feature itself) */
  workflows: ImpactRef[];
  /** Business objects: those whose fields reference the object; for a feature: the objects it uses */
  objects: ImpactRef[];
  /** For a feature: the features it calls */
  calls: ImpactRef[];
}

const ref = (e: ModelEntry<Feature | BusinessObject>, via: string): ImpactRef => ({ id: e.data.id, name: e.data.name, component: e.component, via });

export function impactOf(model: CatalogModel, kind: 'feature' | 'business_object', id: string): Impact {
  const impact: Impact = { kind, id, exists: false, features: [], workflows: [], objects: [], calls: [] };
  const seen = new Set<string>();
  const addFeature = (e: ModelEntry<Feature>, via: string) => {
    if (seen.has(e.data.id)) return;
    seen.add(e.data.id);
    impact.features.push(ref(e, via));
  };
  const callersOf = (target: string) => model.features.filter((f) => Array.isArray(f.data.calls) && f.data.calls.includes(target));

  if (kind === 'business_object') {
    const object = model.objects.find((o) => o.data.id === id);
    impact.exists = Boolean(object);
    const keys = new Set([typeKey(id), ...(object?.data.name ? [typeKey(object.data.name)] : [])]);
    for (const f of model.features) {
      const uses = (Array.isArray(f.data.objects) ? f.data.objects : []).filter((o) => o?.id === id);
      if (uses.length) addFeature(f, `objects: ${[...new Set(uses.map((u) => u.access))].join(', ')}`);
    }
    // features that compute the object (PRODUCTCREATOR-39)
    for (const fid of object?.data.computedBy ?? []) {
      const producer = model.features.find((f) => f.data.id === fid);
      if (producer) addFeature(producer, 'computedBy');
    }
    for (const direct of [...impact.features]) for (const caller of callersOf(direct.id)) addFeature(caller, `calls ${direct.id}`);
    for (const o of model.objects) {
      if (o.data.id === id) continue;
      const fields = (Array.isArray(o.data.fields) ? o.data.fields : []).filter((fl) => {
        const t = fl && typeof fl.type === 'string' ? referencedType(fl.type) : null;
        return t !== null && keys.has(typeKey(t));
      });
      if (fields.length) impact.objects.push(ref(o, `fields: ${fields.map((fl) => fl.name).join(', ')}`));
    }
  } else {
    const feature = model.features.find((f) => f.data.id === id);
    impact.exists = Boolean(feature);
    seen.add(id);
    for (const caller of callersOf(id)) addFeature(caller, `calls ${id}`);
    for (const direct of [...impact.features]) for (const caller of callersOf(direct.id)) addFeature(caller, `calls ${direct.id}`);
    for (const call of feature?.data.calls ?? []) {
      const target = model.features.find((f) => f.data.id === call);
      impact.calls.push(target ? ref(target, 'called') : { id: call, via: 'called (unknown feature)' });
    }
    for (const use of feature?.data.objects ?? []) {
      const target = model.objects.find((o) => o.data.id === use.id);
      impact.objects.push(target ? ref(target, `objects: ${use.access}`) : { id: use.id, via: `objects: ${use.access} (unknown object)` });
    }
    // objects the feature computes (PRODUCTCREATOR-39)
    for (const o of model.objects) {
      if (Array.isArray(o.data.computedBy) && o.data.computedBy.includes(id) && !impact.objects.some((x) => x.id === o.data.id)) impact.objects.push(ref(o, 'computedBy'));
    }
  }

  const affected = new Set([...(kind === 'feature' ? [id] : []), ...impact.features.map((f) => f.id)]);
  for (const w of model.workflows as ModelEntry<Workflow>[]) {
    const steps = Array.isArray(w.data.steps) ? w.data.steps : [];
    const hits = steps.map((s, i) => (affected.has(s) ? `steps[${i}] ${s}` : '')).filter(Boolean);
    for (const [step, compensation] of Object.entries(w.data.compensations ?? {})) {
      if (affected.has(compensation)) hits.push(`compensations.${step} ${compensation}`);
    }
    if (hits.length) impact.workflows.push({ id: w.data.workflow, name: w.data.name, component: w.component, via: hits.join('; ') });
  }
  return impact;
}

export interface DuplicateQuery {
  kind?: EntityKind;
  /** Proposed name: entries with the same name (case/space-insensitive) or the same compact key */
  name?: string;
  /** Proposed id: the same id, or (features) the same <entity>.<action> in another bounded context */
  id?: string;
}

export interface DuplicateMatch extends ImpactRef {
  kind: EntityKind;
}

/** Without a query: the duplicate ids and names already in the catalog. With name/id: entries a new one would duplicate. */
export function findDuplicates(model: CatalogModel, query: DuplicateQuery = {}): { issues: ValidationIssue[]; matches: DuplicateMatch[] } {
  const kinds: EntityKind[] = query.kind ? [query.kind] : ['feature', 'workflow', 'business_object', 'stream'];
  if (!query.name && !query.id) {
    const issues = validateModel(model).filter((i) => (i.code === 'duplicate_id' || i.code === 'duplicate_name') && (kinds as string[]).includes(i.kind));
    return { issues, matches: [] };
  }
  const name = query.name?.trim().toLowerCase().replace(/\s+/g, ' ');
  const nameKey = query.name ? typeKey(query.name) : '';
  const matches: DuplicateMatch[] = [];
  for (const kind of kinds) {
    for (const e of lists(model, kind)) {
      const data = (e.data ?? {}) as { name?: string; entity?: string; action?: string };
      const id = idOf(kind, e.data);
      const via: string[] = [];
      if (query.id && id === query.id) via.push('same id');
      if (query.id && kind === 'feature') {
        const [, entity, action] = query.id.split('.');
        if (entity && action && id !== query.id && data.entity === entity && data.action === action) via.push('same entity.action');
      }
      if (name && data.name) {
        if (data.name.trim().toLowerCase().replace(/\s+/g, ' ') === name) via.push('same name');
        else if (nameKey && typeKey(data.name) === nameKey) via.push('same name (ignoring spaces/punctuation)');
      }
      if (via.length) matches.push({ kind, id, name: data.name, component: e.component, via: via.join(', ') });
    }
  }
  return { issues: [], matches };
}
