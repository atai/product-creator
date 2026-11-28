import type { ErrorObject } from 'ajv';
import { validators } from './schemas';
import { FEATURE_SPEC_LISTS, type BusinessObject, type Feature, type Stream, type Workflow } from '../types';
import type { ProjectModel } from '../project/model';
import { designIssues, type DesignCode } from './design';

/**
 * Model validation (PRODUCTCREATOR-29): the catalog must not describe something that cannot be implemented.
 * Pure functions over a snapshot of the catalog, used by the UI, the MCP tools and `product-creator lint`.
 *
 *   errors    schema, id pattern, id ≠ <bounded_context>.<entity>.<action>, duplicate ids,
 *             workflow steps / compensations and feature calls → unknown feature,
 *             feature objects → unknown business object, business-object field type → unknown type,
 *             spec items (requirements, acceptance, …) with the same id, acceptance covering an unknown requirement
 *   warnings  duplicate names (features of one component, business objects of one component)
 *
 * References are resolved across all loaded projects.
 *
 * Design checks (PRODUCTCREATOR-34, design.ts) run when the model carries a context (projects, OpenAPI): they
 * are advisory by default — their intended severity is shifted one level down (error → warning → info).
 */

export type EntityKind = 'feature' | 'workflow' | 'business_object' | 'stream';

export interface ModelEntry<T> {
  data: T;
  /** YAML file (absolute) */
  file?: string;
  /** Component (app) id the file belongs to */
  component?: string;
}

/** What design checks need besides the catalog (PRODUCTCREATOR-34) */
export interface DesignContext {
  /** Projects of the components (dependsOn, actors, root for files on disk, check settings) */
  projects: ProjectModel[];
  /** OpenAPI operations of a component as `METHOD path`; null when the component has no spec */
  operations?: (componentId: string) => Set<string> | null;
  /** Does a file exist (tests replace it) */
  exists?: (absolutePath: string) => boolean;
}

export interface CatalogModel {
  features: ModelEntry<Feature>[];
  workflows: ModelEntry<Workflow>[];
  objects: ModelEntry<BusinessObject>[];
  streams?: ModelEntry<Stream>[];
  /** Set by storage.modelSnapshot(); without it design checks do not run */
  context?: DesignContext;
  /** Ids defined by more than one file (only one of them is in the lists above) */
  duplicates?: { kind: EntityKind; id: string; files: string[] }[];
}

export type IssueCode =
  | 'schema'
  | 'id_pattern'
  | 'id_mismatch'
  | 'duplicate_id'
  | 'duplicate_name'
  | 'unknown_feature'
  | 'unknown_object'
  | 'unknown_type'
  | 'compensation_not_in_steps'
  | 'duplicate_item_id'
  | 'unknown_requirement'
  /** spec only (PRODUCTCREATOR-36): a declared screenshot has no image, or its capture failed */
  | 'screen_missing'
  | 'screen_failed'
  | 'unknown_workflow'
  | DesignCode;

export type Severity = 'error' | 'warning' | 'info';
export type IssueKind = EntityKind | 'component' | 'project';

export interface ValidationIssue {
  severity: Severity;
  code: IssueCode;
  kind: IssueKind;
  /** Feature / business-object id or workflow key */
  id: string;
  /** Where in the entry, e.g. `steps[2]`, `objects[0].id`, `fields.budget.type` */
  field?: string;
  message: string;
  file?: string;
  component?: string;
  /** 'design': a design check (PRODUCTCREATOR-34); its severity follows checks.mode / overrides */
  check?: 'design';
  /** Severity of a design check in strict mode */
  intended?: Severity;
}

const KINDS = new Set<EntityKind>(['feature', 'workflow', 'business_object', 'stream']);

/** Kind from user input; 'function' is the old name of 'feature' (PRODUCTCREATOR-28). null: not a validated kind */
export const normalizeKind = (kind: unknown): EntityKind | null => {
  const k = kind === 'function' ? 'feature' : kind;
  return KINDS.has(k as EntityKind) ? (k as EntityKind) : null;
};

export const idOf = (kind: EntityKind, data: unknown): string => {
  const rec = (data ?? {}) as Record<string, unknown>;
  return String((kind === 'workflow' ? rec.workflow : kind === 'stream' ? rec.stream : rec.id) ?? '');
};

/** Data as it is written to YAML: no undefined values, no UI-only fields (childObjects of the business-object list) */
function plain(kind: EntityKind, data: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(data ?? {})) as Record<string, unknown>;
  if (kind === 'business_object') delete copy.childObjects;
  return copy;
}

/** Human message for one schema error: anyOf of `required` → "needs one of …", pattern → the field's description */
function schemaMessage(e: ErrorObject): string {
  const parent = (e.parentSchema ?? {}) as { description?: string; anyOf?: { required?: string[] }[] };
  if (e.keyword === 'anyOf' && parent.anyOf?.every((b) => b.required?.length)) {
    return `needs one of: ${parent.anyOf.map((b) => (b.required ?? []).join(' + ')).join(', ')}`;
  }
  if (e.keyword === 'pattern' && parent.description) return `${e.message}. ${parent.description}`;
  if (e.keyword === 'enum') return `must be one of: ${((e.params as { allowedValues?: unknown[] }).allowedValues ?? []).join(', ')}`;
  return e.message ?? 'is invalid';
}

function schemaIssues(kind: EntityKind, entry: ModelEntry<unknown>): ValidationIssue[] {
  const validate = validators[kind];
  if (validate(plain(kind, entry.data))) return [];
  const id = idOf(kind, entry.data);
  // errors inside anyOf branches are summarised by the anyOf error itself
  const errors = (validate.errors ?? []).filter((e) => !e.schemaPath.includes('/anyOf/'));
  return errors.map((e: ErrorObject) => {
    const field = e.instancePath.replace(/^\//, '').replace(/\//g, '.') || undefined;
    const isIdPattern = e.keyword === 'pattern' && (field === 'id' || field === 'workflow' || field === 'stream');
    const extra = e.keyword === 'additionalProperties' ? ` (${(e.params as { additionalProperty?: string }).additionalProperty})` : '';
    return {
      severity: 'error' as const,
      code: isIdPattern ? ('id_pattern' as const) : ('schema' as const),
      kind,
      id,
      field,
      message: isIdPattern
        ? kind === 'workflow' || kind === 'stream'
          ? `${kind === 'workflow' ? 'Workflow' : 'Stream'} key "${id}" must match <context>.<name> (lowercase letters, digits, _)`
          : `Id "${id}" must match ${kind === 'feature' ? '<bounded_context>.<entity>.<action>' : 'the id pattern'} (${String((e.params as { pattern?: string }).pattern)})`
        : `${field ?? kind}: ${schemaMessage(e)}${extra}`,
      file: entry.file,
      component: entry.component,
    };
  });
}

/** Scalar field types: generic, SQL and Prisma names; `string(255)`, `decimal(10,2)`, `enum<a|b>`, `T?`, `T[]` are accepted */
const SCALARS = new Set(
  [
    'string', 'text', 'char', 'varchar', 'character varying', 'uuid', 'cuid', 'email', 'url', 'id',
    'int', 'integer', 'smallint', 'bigint', 'serial', 'number', 'float', 'double', 'double precision', 'real', 'decimal', 'numeric', 'money',
    'boolean', 'bool', 'date', 'datetime', 'time', 'timestamp', 'timestamptz', 'interval',
    'json', 'jsonb', 'object', 'array', 'bytes', 'binary', 'blob', 'enum', 'any', 'unknown', 'unsupported',
  ].map((t) => t.toLowerCase())
);

/** Name used to match a field type with a business object: `Budget`, `budget[]`, `budget-project` → `budget`, `budgetproject` */
export const typeKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** null: scalar; otherwise the referenced type name (without ?, [] and parameters) */
export function referencedType(type: string): string | null {
  const base = type
    .trim()
    .replace(/\[\]$/, '')
    .replace(/\?$/, '')
    .replace(/\[\]$/, '')
    .trim();
  if (!base) return null;
  const lower = base.toLowerCase();
  if (/^enum\s*[<(]/.test(lower)) return null;
  const name = lower.replace(/\s*\(.*\)$/, '').trim();
  if (SCALARS.has(name)) return null;
  return base;
}

function objectKeys(objects: ModelEntry<BusinessObject>[]): Set<string> {
  const keys = new Set<string>();
  for (const o of objects) {
    keys.add(typeKey(o.data.id ?? ''));
    if (o.data.name) keys.add(typeKey(o.data.name));
  }
  return keys;
}

const normName = (name: unknown) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function duplicateNames(kind: EntityKind, entries: ModelEntry<{ name?: string; id?: string }>[]): ValidationIssue[] {
  const groups = new Map<string, ModelEntry<{ name?: string; id?: string }>[]>();
  for (const e of entries) {
    const name = normName(e.data.name);
    if (!name) continue;
    const key = `${e.component ?? ''}|${name}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const issues: ValidationIssue[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ids = group.map((e) => idOf(kind, e.data));
    for (const e of group) {
      issues.push({
        severity: 'warning',
        code: 'duplicate_name',
        kind,
        id: idOf(kind, e.data),
        field: 'name',
        message: `Name "${e.data.name}" is also used by ${ids.filter((i) => i !== idOf(kind, e.data)).join(', ')}`,
        file: e.file,
        component: e.component,
      });
    }
  }
  return issues;
}

function duplicateIds(model: CatalogModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reported = new Set<string>();
  for (const d of model.duplicates ?? []) {
    reported.add(`${d.kind}|${d.id}`);
    issues.push({ severity: 'error', code: 'duplicate_id', kind: d.kind, id: d.id, message: `Id "${d.id}" is defined in ${d.files.length} files: ${d.files.join(', ')}`, file: d.files[0] });
  }
  const lists: [EntityKind, ModelEntry<unknown>[]][] = [
    ['feature', model.features],
    ['workflow', model.workflows],
    ['business_object', model.objects],
    ['stream', model.streams ?? []],
  ];
  for (const [kind, entries] of lists) {
    const byId = new Map<string, ModelEntry<unknown>[]>();
    for (const e of entries) byId.set(idOf(kind, e.data), [...(byId.get(idOf(kind, e.data)) ?? []), e]);
    for (const [id, group] of byId) {
      if (group.length < 2 || reported.has(`${kind}|${id}`)) continue;
      const where = group.map((e) => e.file ?? e.component ?? '(new)').join(', ');
      issues.push({ severity: 'error', code: 'duplicate_id', kind, id, message: `Id "${id}" is defined ${group.length} times: ${where}`, file: group[0].file, component: group[0].component });
    }
  }
  return issues;
}

/** Spec items of one feature (PRODUCTCREATOR-32): ids unique per list, acceptance `covers` → existing requirements */
function specIssues(e: ModelEntry<Feature>): ValidationIssue[] {
  const f = e.data;
  const issues: ValidationIssue[] = [];
  const at = { kind: 'feature' as const, id: f.id, file: e.file, component: e.component };
  for (const list of FEATURE_SPEC_LISTS) {
    const items: unknown = f[list];
    if (!Array.isArray(items)) continue;
    const seen = new Set<string>();
    items.forEach((item: { id?: unknown } | null, i) => {
      const itemId = item?.id;
      if (typeof itemId !== 'string') return;
      if (seen.has(itemId)) issues.push({ severity: 'error', code: 'duplicate_item_id', field: `${list}[${i}].id`, message: `${list}: id "${itemId}" is used more than once; give each item its own id`, ...at });
      seen.add(itemId);
    });
  }
  const requirementIds = new Set((Array.isArray(f.requirements) ? f.requirements : []).map((r) => r?.id));
  (Array.isArray(f.acceptance) ? f.acceptance : []).forEach((a, i) => {
    (Array.isArray(a?.covers) ? a.covers : []).forEach((req, j) => {
      if (typeof req === 'string' && !requirementIds.has(req)) {
        issues.push({ severity: 'error', code: 'unknown_requirement', field: `acceptance[${i}].covers[${j}]`, message: `Acceptance ${a.id} covers requirement "${req}", which is not in requirements`, ...at });
      }
    });
  });
  return issues;
}

export function validateModel(model: CatalogModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const featureIds = new Set(model.features.map((f) => f.data.id));
  const objectIds = new Set(model.objects.map((o) => o.data.id));
  const objectTypeKeys = objectKeys(model.objects);
  const at = (e: ModelEntry<unknown>) => ({ file: e.file, component: e.component });

  for (const e of model.features) {
    const f = e.data;
    issues.push(...schemaIssues('feature', e));
    issues.push(...specIssues(e));
    if (f.id && f.bounded_context && f.entity && f.action && f.id !== `${f.bounded_context}.${f.entity}.${f.action}`) {
      issues.push({ severity: 'error', code: 'id_mismatch', kind: 'feature', id: f.id, field: 'id', message: `Id "${f.id}" must be ${f.bounded_context}.${f.entity}.${f.action} (<bounded_context>.<entity>.<action>)`, ...at(e) });
    }
    (Array.isArray(f.calls) ? f.calls : []).forEach((call, i) => {
      if (!featureIds.has(call)) issues.push({ severity: 'error', code: 'unknown_feature', kind: 'feature', id: f.id, field: `calls[${i}]`, message: `Calls unknown feature "${call}"`, ...at(e) });
    });
    (Array.isArray(f.objects) ? f.objects : []).forEach((ref, i) => {
      if (ref && typeof ref.id === 'string' && !objectIds.has(ref.id)) {
        issues.push({ severity: 'error', code: 'unknown_object', kind: 'feature', id: f.id, field: `objects[${i}].id`, message: `Uses unknown business object "${ref.id}"`, ...at(e) });
      }
    });
  }

  for (const e of model.workflows) {
    const w = e.data;
    issues.push(...schemaIssues('workflow', e));
    const steps = Array.isArray(w.steps) ? w.steps : [];
    steps.forEach((step, i) => {
      if (!featureIds.has(step)) issues.push({ severity: 'error', code: 'unknown_feature', kind: 'workflow', id: w.workflow, field: `steps[${i}]`, message: `Step "${step}" is not a feature of the catalog`, ...at(e) });
    });
    for (const [step, compensation] of Object.entries(w.compensations ?? {})) {
      if (!featureIds.has(step)) issues.push({ severity: 'error', code: 'unknown_feature', kind: 'workflow', id: w.workflow, field: `compensations.${step}`, message: `Compensated step "${step}" is not a feature of the catalog`, ...at(e) });
      else if (!steps.includes(step)) issues.push({ severity: 'warning', code: 'compensation_not_in_steps', kind: 'workflow', id: w.workflow, field: `compensations.${step}`, message: `Compensation for "${step}", which is not a step of the workflow`, ...at(e) });
      if (!featureIds.has(compensation)) issues.push({ severity: 'error', code: 'unknown_feature', kind: 'workflow', id: w.workflow, field: `compensations.${step}`, message: `Compensation "${compensation}" is not a feature of the catalog`, ...at(e) });
    }
  }

  for (const e of model.objects) {
    const o = e.data;
    issues.push(...schemaIssues('business_object', e));
    // computed objects name the features that produce them (PRODUCTCREATOR-39)
    (Array.isArray(o.computedBy) ? o.computedBy : []).forEach((fid, i) => {
      if (typeof fid === 'string' && !featureIds.has(fid)) issues.push({ severity: 'error', code: 'unknown_feature', kind: 'business_object', id: o.id, field: `computedBy[${i}]`, message: `Computed by unknown feature "${fid}"`, ...at(e) });
    });
    (Array.isArray(o.fields) ? o.fields : []).forEach((field) => {
      if (!field || typeof field.type !== 'string') return;
      const ref = referencedType(field.type);
      if (ref && !objectTypeKeys.has(typeKey(ref))) {
        issues.push({ severity: 'error', code: 'unknown_type', kind: 'business_object', id: o.id, field: `fields.${field.name}.type`, message: `Field "${field.name}" has type "${field.type}", which is neither a scalar nor a business object`, ...at(e) });
      }
    });
  }

  const workflowKeys = new Set(model.workflows.map((w) => w.data.workflow));
  for (const e of model.streams ?? []) {
    const st = e.data;
    issues.push(...schemaIssues('stream', e));
    const stages = Array.isArray(st.stages) ? st.stages : [];
    stages.forEach((stage, i) => {
      (Array.isArray(stage?.workflows) ? stage.workflows : []).forEach((wf, j) => {
        if (!workflowKeys.has(wf)) issues.push({ severity: 'error', code: 'unknown_workflow', kind: 'stream', id: st.stream, field: `stages[${i}].workflows[${j}]`, message: `Stage "${stage.name}" runs unknown workflow "${wf}"`, ...at(e) });
      });
      // PRODUCTCREATOR-43: a stage names the features that do its work
      (Array.isArray(stage?.features) ? stage.features : []).forEach((f, j) => {
        if (!featureIds.has(f)) issues.push({ severity: 'error', code: 'unknown_feature', kind: 'stream', id: st.stream, field: `stages[${i}].features[${j}]`, message: `Stage "${stage.name}" names unknown feature "${f}"`, ...at(e) });
      });
    });
    // ids of stages and KPIs are the keys of translations and references: unique in the stream
    for (const [list, items] of [['stages', stages], ['kpis', Array.isArray(st.kpis) ? st.kpis : []]] as const) {
      const seen = new Set<string>();
      items.forEach((item, i) => {
        const id = (item as { id?: unknown })?.id;
        if (typeof id !== 'string') return;
        if (seen.has(id)) issues.push({ severity: 'error', code: 'duplicate_id', kind: 'stream', id: st.stream, field: `${list}[${i}].id`, message: `${list === 'stages' ? 'Stage' : 'KPI'} id "${id}" is used twice in the stream`, ...at(e) });
        seen.add(id);
      });
    }
  }

  issues.push(...duplicateIds(model));
  issues.push(...duplicateNames('feature', model.features as ModelEntry<{ name?: string; id?: string }>[]));
  issues.push(...duplicateNames('business_object', model.objects as ModelEntry<{ name?: string; id?: string }>[]));
  issues.push(...duplicateNames('stream', (model.streams ?? []) as ModelEntry<{ name?: string; id?: string }>[]));
  if (model.context) issues.push(...designIssues(model, model.context));
  return issues;
}

export const countIssues = (issues: ValidationIssue[]) => ({
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warning').length,
  infos: issues.filter((i) => i.severity === 'info').length,
});
