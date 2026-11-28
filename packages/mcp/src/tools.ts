import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { updateProject, type ComponentModel, type ProjectModel } from '@pc/core/project/model';
import { catalogSchemas } from '@pc/core/validation/schemas';
import type { ActionLog } from './audit.js';
import { compactArgs } from './audit.js';
import type { McpHost, Principal } from './host.js';

/** Entity kinds of the feature catalog and how the core API addresses them */
const KINDS = {
  feature: { list: '/api/features', save: '/api/save-feature', key: 'data', idOf: (e: Rec) => e.id },
  business_object: { list: '/api/business-objects', save: '/api/save-business-object', key: 'businessObject', idOf: (e: Rec) => e.id },
  workflow: { list: '/api/workflows', save: '/api/save-workflow', key: 'workflow', idOf: (e: Rec) => e.workflow },
  stream: { list: '/api/streams', save: '/api/save-stream', key: 'stream', idOf: (e: Rec) => e.stream },
} as const;
type Kind = keyof typeof KINDS;
type Rec = Record<string, unknown>;

const kindSchema = z
  .enum(['feature', 'business_object', 'workflow', 'stream', 'function'])
  .describe("Catalog entry type. A feature is a business capability (id <bounded_context>.<entity>.<action>); 'function' is its old name, accepted for one version");
/** 'function' → 'feature' (renamed in PRODUCTCREATOR-28) */
const kindOf = (kind: z.infer<typeof kindSchema>): Kind => (kind === 'function' ? 'feature' : kind);
const projectArg = z.string().describe('Project id, slug, name or root path (see list_projects)');
const componentArg = z.string().describe('Component (service/library) id or slug (see list_components)');

class ToolError extends Error {}

const MAX_LIST = 500;
const DEFAULT_LIST = 100;
const SYNC_TIMEOUT_MS = 180_000;

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export interface ToolContext {
  host: McpHost;
  principal: Principal;
  audit: ActionLog;
}

function resolveProject(host: McpHost, ref: string): ProjectModel {
  const projects = host.projects();
  const needle = ref.trim();
  const resolved = path.resolve(needle);
  const hits = projects.filter((p) => p.id === needle || p.slug === needle || p.root === resolved);
  const byName = hits.length ? hits : projects.filter((p) => p.name.toLowerCase() === needle.toLowerCase());
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new ToolError(`Project "${ref}" is ambiguous: use one of the ids ${byName.map((p) => p.id).join(', ')}`);
  throw new ToolError(`Project "${ref}" is not open in Product Creator. Open projects: ${projects.map((p) => p.slug).join(', ') || 'none'}`);
}

function resolveComponent(project: ProjectModel, ref: string): ComponentModel {
  const hit = project.components.find((c) => c.id === ref || c.slug === ref);
  if (!hit) throw new ToolError(`Component "${ref}" not found in project ${project.slug}. Components: ${project.components.map((c) => c.slug).join(', ') || 'none'}`);
  return hit;
}

const componentSummary = (c: ComponentModel) => ({
  id: c.id,
  kind: c.kind,
  slug: c.slug,
  name: c.name,
  description: c.description,
  path: c.path,
  catalog: c.catalog,
  codeBasePath: c.codeBasePath,
  dbSchemaPath: c.dbSchemaPath,
  openapi: c.openapi,
  openapiGenerate: Boolean(c.openapiGenerate),
  dependsOn: c.dependsOn,
});

async function api(host: McpHost, method: string, url: string, body?: unknown): Promise<unknown> {
  const res = await host.api({ method, url, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: unknown;
  try {
    json = res.body ? JSON.parse(res.body) : undefined;
  } catch {
    json = res.body;
  }
  if (res.status >= 400) {
    const err = json as { error?: string; details?: unknown; issues?: unknown[] } | undefined;
    const details = err?.details ? ` ${JSON.stringify(err.details)}` : '';
    // model validation of the save handlers (PRODUCTCREATOR-29): the write was rejected, nothing changed
    const issues = err?.issues?.length ? `\nissues: ${JSON.stringify(err.issues)}` : '';
    throw new ToolError(`${err?.error ?? `HTTP ${res.status}`}${details}${issues}`);
  }
  return json;
}

const summarize = (kind: Kind, e: Rec): Rec => {
  switch (kind) {
    case 'feature':
      return { id: e.id, name: e.name, bounded_context: e.bounded_context, entity: e.entity, action: e.action, lifecycle: e.lifecycle, owner: e.owner, source_file: e.source_file, apis: e.apis, tags: e.tags };
    case 'business_object':
      return { id: e.id, name: e.name, lifecycle: e.lifecycle, owner: e.owner, fields: Array.isArray(e.fields) ? e.fields.length : 0 };
    case 'workflow':
      return { workflow: e.workflow, name: e.name, steps: Array.isArray(e.steps) ? e.steps.length : 0 };
    case 'stream':
      return { stream: e.stream, name: e.name, goal: e.goal, stages: Array.isArray(e.stages) ? e.stages.length : 0 };
  }
};

async function listEntries(host: McpHost, kind: Kind, component: ComponentModel): Promise<Rec[]> {
  return (await api(host, 'GET', `${KINDS[kind].list}?app=${encodeURIComponent(component.id)}`)) as Rec[];
}

function relativeSpec(project: ProjectModel, file: string): string {
  const rel = path.relative(project.root, file);
  return rel.startsWith('..') ? path.basename(file) : rel;
}

async function pollSync(host: McpHost, componentId: string, kind: 'sync-code' | 'sync-schema', syncId: string, until: string[]): Promise<Rec> {
  const deadline = Date.now() + SYNC_TIMEOUT_MS;
  for (;;) {
    const state = (await api(host, 'GET', `/api/apps/${componentId}/${kind}/status/${syncId}`)) as Rec & { stage?: string; progress?: { error?: string } };
    if (state.stage && (until.includes(state.stage) || state.stage === 'error')) {
      if (state.stage === 'error') throw new ToolError(`Sync failed: ${state.progress?.error ?? 'unknown error'}`);
      return state;
    }
    if (Date.now() > deadline) throw new ToolError(`Sync did not finish within ${SYNC_TIMEOUT_MS / 1000}s (stage: ${state.stage})`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

interface SyncItem {
  key: string;
  name: string;
  status: unknown;
  action: unknown;
  file?: string;
  id?: unknown;
  changes?: unknown;
}

function syncItems(kind: 'sync-code' | 'sync-schema', state: Rec): SyncItem[] {
  if (kind === 'sync-code') {
    return ((state.matchedFunctions as Rec[]) ?? []).map((m) => {
      const ef = (m.exportedFunction ?? {}) as Rec;
      return { key: `${ef.relativePath}:${ef.name}`, name: String(ef.name), file: String(ef.relativePath), status: m.status, action: m.action, id: m.functionId, reason: m.reason, changes: m.changes };
    });
  }
  return ((state.matchedObjects as Rec[]) ?? []).map((m) => {
    const model = (m.prismaModel ?? {}) as Rec;
    return { key: String(model.name), name: String(model.name), status: m.status, action: m.action, id: m.businessObjectId, changes: m.changes };
  });
}

const countBy = (items: SyncItem[]) => {
  const out: Record<string, number> = {};
  for (const i of items) out[String(i.action)] = (out[String(i.action)] ?? 0) + 1;
  return out;
};

async function syncPreview(host: McpHost, component: ComponentModel, kind: 'sync-code' | 'sync-schema', limit: number) {
  const start = (await api(host, 'POST', `/api/apps/${component.id}/${kind}/start`, {})) as { syncId?: string };
  if (!start.syncId) throw new ToolError('Sync did not start');
  const state = await pollSync(host, component.id, kind, start.syncId, ['matching']);
  const items = syncItems(kind, state);
  return { syncId: start.syncId, total: items.length, plannedActions: countBy(items), items: items.slice(0, limit), truncated: items.length > limit };
}

async function syncApply(host: McpHost, component: ComponentModel, kind: 'sync-code' | 'sync-schema', allowDelete: boolean, create: string[] = []) {
  const start = (await api(host, 'POST', `/api/apps/${component.id}/${kind}/start`, {})) as { syncId?: string };
  if (!start.syncId) throw new ToolError('Sync did not start');
  const state = await pollSync(host, component.id, kind, start.syncId, ['matching']);
  const items = syncItems(kind, state);
  const overrides: Record<string, string> = {};
  let skippedDeletes = 0;
  for (const i of items) {
    if (kind === 'sync-code' && i.status === 'stale') {
      // features whose code file is gone: unlink only when allowed
      if (allowDelete) overrides[i.key] = 'unlink';
      else skippedDeletes++;
    } else if (!allowDelete && (i.action === 'delete' || i.action === 'unlink')) {
      overrides[i.key] = 'skip';
      skippedDeletes++;
    }
  }
  // code sync: create features only for the candidates named by the caller (PRODUCTCREATOR-30)
  const unknown = create.filter((key) => !items.some((i) => i.key === key && i.status === 'candidate'));
  if (unknown.length) throw new ToolError(`Not candidates of this sync (see sync_code_preview): ${unknown.join(', ')}`);
  for (const key of create) overrides[key] = 'create';
  await api(host, 'POST', `/api/apps/${component.id}/${kind}/actions`, { syncId: start.syncId, actions: overrides });
  await api(host, 'POST', `/api/apps/${component.id}/${kind}/execute`, { syncId: start.syncId });
  await pollSync(host, component.id, kind, start.syncId, ['completed']);
  await host.changed?.();
  const applied = items.map((i) => ({ ...i, action: overrides[i.key] ?? i.action })).filter((i) => i.action !== 'skip');
  return {
    syncId: start.syncId,
    applied: countBy(applied),
    skippedDeletes,
    note: skippedDeletes ? `${kind === 'sync-code' ? 'unlink' : 'delete'} actions were skipped; pass ${kind === 'sync-code' ? 'allow_unlink' : 'allow_delete'}=true to apply them` : undefined,
  };
}

/** Model checks are global; tools report the entries of one project, with component slugs instead of ids */
type Issue = { severity: string; code: string; kind: string; id: string; field?: string; message: string; file?: string; component?: string };
function projectView<T extends { component?: string; file?: string }>(project: ProjectModel, items: T[], keepOthers = false): (T & { component?: string })[] {
  const slugs = new Map(project.components.map((c) => [c.id, c.slug]));
  return items
    .filter((i) => keepOthers || (i.component !== undefined && slugs.has(i.component)))
    .map((i) => ({ ...i, component: i.component ? slugs.get(i.component) ?? i.component : undefined, ...(i.file ? { file: relativeSpec(project, i.file) } : {}) }));
}

const planChangeSchema = z.object({
  kind: z.enum(['feature', 'business_object', 'workflow', 'function']).describe("Entry type ('function' = old name of 'feature')"),
  op: z.enum(['upsert', 'delete']).optional().describe('upsert (default): create or replace the entry with data; delete: remove entry `id`'),
  data: z.record(z.string(), z.unknown()).optional().describe('Full proposed entry (for upsert)'),
  id: z.string().optional().describe('Entry id (for delete)'),
  component: componentArg.optional().describe('Component the entry goes to (default: where it is now)'),
});

/** Tools that change files; offered only to read-write principals (named in the server instructions for read-only ones) */
export const WRITE_TOOLS = ['apply_plan', 'update_project', 'create_catalog_entry', 'update_catalog_entry', 'sync_code_apply', 'sync_schema_apply', 'generate_openapi'] as const;

/** All tools. `write: true` tools exist only for read-write principals. */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  const { host, principal, audit } = ctx;

  const define = <S extends z.ZodRawShape>(
    name: string,
    spec: { title: string; description: string; write?: boolean; input: S },
    run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>
  ) => {
    const write = spec.write === true;
    if (write && principal.scope !== 'write') return; // not offered to read-only tokens
    server.registerTool(
      name,
      {
        title: spec.title,
        description: spec.description + (write ? ' (changes files; needs a read-write token)' : ''),
        inputSchema: spec.input,
        annotations: { readOnlyHint: !write, destructiveHint: false, openWorldHint: false },
      },
      (async (args: z.infer<z.ZodObject<S>>): Promise<CallToolResult> => {
        const started = Date.now();
        const base = { principal: principal.id, scope: principal.scope, userAgent: principal.userAgent, action: name, write, args: compactArgs(args) };
        if (write && principal.scope !== 'write') {
          audit.record({ ...base, outcome: 'denied', message: 'token is read-only' });
          return fail('This token is read-only');
        }
        try {
          const result = await run(args);
          audit.record({ ...base, outcome: 'ok', durationMs: Date.now() - started });
          return ok(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          audit.record({ ...base, outcome: 'error', durationMs: Date.now() - started, message: message.slice(0, 300) });
          return fail(message);
        }
      }) as never
    );
  };

  define('list_projects', { title: 'List projects', description: 'Projects open in Product Creator (the only ones agents can access) with their component counts.', input: {} }, async () =>
    host.projects().map((p) => ({ id: p.id, slug: p.slug, name: p.name, description: p.description, root: p.root, catalogRoot: p.catalogRoot, docs: p.docs, components: p.components.length }))
  );

  define(
    'list_components',
    { title: 'List services and libraries', description: 'Components (services and libraries) of a project with their paths, code base, DB schema and OpenAPI settings.', input: { project: projectArg, kind: z.enum(['service', 'library']).optional() } },
    async ({ project, kind }) => resolveProject(host, project).components.filter((c) => !kind || c.kind === kind).map(componentSummary)
  );

  define(
    'list_catalog',
    {
      title: 'List catalog entries',
      description: 'List catalog entries (features, business objects, workflows, streams) of a project or one component. Returns compact summaries; use get_catalog_entry for the full card. Features carry `source_file` links to the code that implements them.',
      input: {
        project: projectArg,
        kind: kindSchema,
        component: componentArg.optional().describe('Limit to one component; default: all components of the project'),
        query: z.string().optional().describe('Case-insensitive text filter'),
        limit: z.number().int().min(1).max(MAX_LIST).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ project, kind: kindArg, component, query, limit, offset }) => {
      const kind = kindOf(kindArg);
      const p = resolveProject(host, project);
      const components = component ? [resolveComponent(p, component)] : p.components;
      const rows: Rec[] = [];
      for (const c of components) {
        for (const e of await listEntries(host, kind, c)) {
          if (query && !JSON.stringify(e).toLowerCase().includes(query.toLowerCase())) continue;
          rows.push({ component: c.slug, ...summarize(kind, e) });
        }
      }
      const start = offset ?? 0;
      const size = limit ?? DEFAULT_LIST;
      return { total: rows.length, offset: start, items: rows.slice(start, start + size) };
    }
  );

  define(
    'get_project',
    {
      title: 'Get the product context of a project',
      description:
        'Product-level context for specs: vision, goals (G1…), actors (ids that features use in `actors`), glossary, tracker (issueUrl with {id}, for ticket links), plus name, description and components.',
      input: { project: projectArg },
    },
    async ({ project }) => {
      const p = resolveProject(host, project);
      return {
        id: p.id, slug: p.slug, name: p.name, description: p.description,
        vision: p.vision, goals: p.goals ?? [], actors: p.actors ?? [], glossary: p.glossary ?? [], tracker: p.tracker,
        components: p.components.map((c) => ({ slug: c.slug, kind: c.kind, name: c.name })),
      };
    }
  );

  define(
    'get_catalog_entry',
    {
      title: 'Get a catalog entry',
      description: 'Full card of a feature, business object, workflow or stream. `id` is the feature/business-object id, the workflow key or the stream key.',
      input: { project: projectArg, kind: kindSchema, id: z.string(), component: componentArg.optional() },
    },
    async ({ project, kind: kindArg, id, component }) => {
      const kind = kindOf(kindArg);
      const p = resolveProject(host, project);
      for (const c of component ? [resolveComponent(p, component)] : p.components) {
        const hit = (await listEntries(host, kind, c)).find((e) => KINDS[kind].idOf(e) === id);
        if (hit) return { component: c.slug, entry: hit };
      }
      throw new ToolError(`${kind} "${id}" not found in project ${p.slug}`);
    }
  );

  define(
    'get_schema',
    {
      title: 'Get the schema of a catalog entry',
      description:
        'JSON Schema of a feature, business object or workflow card: fields, required fields, id patterns, enums, and `x-audience` (human | agent | both: who a field is for). Read it before writing a card. A feature carries its spec: actors, requirements (R1…), acceptance (A1…, given/when/then or text, `covers` requirement ids, `verify` command), constraints (C1…), decisions (D1…), open_questions (Q1…).',
      input: { kind: z.enum(['feature', 'business_object', 'workflow', 'function']).describe("'function' is the old name of 'feature'") },
    },
    async ({ kind }) => ({ kind: kind === 'function' ? 'feature' : kind, schema: catalogSchemas[kind === 'function' ? 'feature' : kind] })
  );

  define(
    'validate_catalog',
    {
      title: 'Validate the catalog',
      description:
        'Model problems of a project: workflow steps/compensations and feature calls that are not features, feature objects that are not business objects, business-object field types that are neither scalars nor objects, duplicate ids and names, id patterns, schemas. Streams are not checked.',
      input: { project: projectArg, component: componentArg.optional(), severity: z.enum(['error', 'warning']).optional(), limit: z.number().int().min(1).max(MAX_LIST).optional() },
    },
    async ({ project, component, severity, limit }) => {
      const p = resolveProject(host, project);
      const c = component ? resolveComponent(p, component) : undefined;
      const res = (await api(host, 'GET', `/api/validation${c ? `?app=${encodeURIComponent(c.id)}` : ''}`)) as { issues: Issue[] };
      const issues = projectView(p, res.issues).filter((i) => !severity || i.severity === severity);
      return {
        errors: issues.filter((i) => i.severity === 'error').length,
        warnings: issues.filter((i) => i.severity === 'warning').length,
        issues: issues.slice(0, limit ?? DEFAULT_LIST),
      };
    }
  );

  define(
    'validate_plan',
    {
      title: 'Check a plan before writing',
      description:
        'Check proposed catalog changes (new or changed features, workflows, business objects; deletions) against the model without writing anything. Returns ok=false and the errors the plan would add (unknown features/objects/types, duplicates, schema), plus problems the touched entries already have. Write tools run the same check and reject changes that add errors.',
      input: { project: projectArg, changes: z.array(planChangeSchema).min(1).max(200) },
    },
    async ({ project, changes }) => {
      const p = resolveProject(host, project);
      const body = changes.map((ch) => ({ ...ch, component: ch.component ? resolveComponent(p, ch.component).id : undefined }));
      const res = (await api(host, 'POST', '/api/validate-plan', { changes: body })) as { ok: boolean; introduced: Issue[]; existing: Issue[] };
      return { ok: res.ok, introduced: projectView(p, res.introduced, true), existing: projectView(p, res.existing, true) };
    }
  );

  define(
    'impact_of_change',
    {
      title: 'Impact of changing a feature or object',
      description:
        'What a change of a business object or a feature affects: features that use the object (read/write) or call the feature, their callers (one level), workflows that contain them, objects whose fields reference the object; for a feature also the features it calls and the objects it uses.',
      input: { project: projectArg, kind: z.enum(['business_object', 'feature', 'function']), id: z.string() },
    },
    async ({ project, kind, id }) => {
      const p = resolveProject(host, project);
      const res = (await api(host, 'GET', `/api/impact?kind=${kind === 'function' ? 'feature' : kind}&id=${encodeURIComponent(id)}`)) as Record<string, unknown> & {
        features: { component?: string }[];
        workflows: { component?: string }[];
        objects: { component?: string }[];
        calls: { component?: string }[];
      };
      return { ...res, features: projectView(p, res.features, true), workflows: projectView(p, res.workflows, true), objects: projectView(p, res.objects, true), calls: projectView(p, res.calls, true) };
    }
  );

  define(
    'find_duplicates',
    {
      title: 'Find duplicates',
      description:
        'Before creating an entry: pass the proposed name and/or id to get existing entries with the same name (ignoring case, spaces, punctuation), the same id, or (features) the same <entity>.<action> in another bounded context. Without name/id: duplicate ids and names already in the catalog.',
      input: { project: projectArg, kind: z.enum(['feature', 'business_object', 'workflow', 'function']).optional(), name: z.string().optional(), id: z.string().optional() },
    },
    async ({ project, kind, name, id }) => {
      const p = resolveProject(host, project);
      const q = new URLSearchParams();
      if (kind) q.set('kind', kind === 'function' ? 'feature' : kind);
      if (name) q.set('name', name);
      if (id) q.set('id', id);
      const res = (await api(host, 'GET', `/api/duplicates?${q}`)) as { issues: Issue[]; matches: { component?: string }[] };
      return { matches: projectView(p, res.matches, true), issues: projectView(p, res.issues) };
    }
  );

  define(
    'get_object',
    {
      title: 'Get a business object',
      description: 'A business object with its fields (name, type, description) and tables, and the features that read or write it. Use it to check which fields exist before planning a change.',
      input: { project: projectArg, id: z.string().describe('Business object id'), component: componentArg.optional() },
    },
    async ({ project, id, component }) => {
      const p = resolveProject(host, project);
      for (const c of component ? [resolveComponent(p, component)] : p.components) {
        const hit = (await listEntries(host, 'business_object', c)).find((e) => e.id === id);
        if (!hit) continue;
        const { childObjects: _children, ...object } = hit;
        const impact = (await api(host, 'GET', `/api/impact?kind=business_object&id=${encodeURIComponent(id)}`)) as { features: { id: string; via: string; component?: string }[] };
        const usedBy = projectView(p, impact.features, true).filter((f) => f.via.startsWith('objects:'));
        return { component: c.slug, object, usedBy };
      }
      throw new ToolError(`business_object "${id}" not found in project ${p.slug}`);
    }
  );

  define(
    'list_interfaces',
    {
      title: 'List API operations',
      description: 'OpenAPI operations of the services of a project (from the committed or generated specs).',
      input: { project: projectArg, component: componentArg.optional(), query: z.string().optional(), limit: z.number().int().min(1).max(MAX_LIST).optional() },
    },
    async ({ project, component, query, limit }) => {
      const p = resolveProject(host, project);
      const out: Rec[] = [];
      for (const c of component ? [resolveComponent(p, component)] : p.components) {
        const res = (await api(host, 'GET', `/api/interfaces?app=${encodeURIComponent(c.id)}`)) as { specs: { file: string; title?: string; version?: string; error?: string; missing?: boolean; operations: Rec[] }[] }[];
        for (const entry of res) {
          for (const spec of entry.specs) {
            const ops = spec.operations.filter((o) => !query || JSON.stringify(o).toLowerCase().includes(query.toLowerCase()));
            out.push({ component: c.slug, spec: relativeSpec(p, spec.file), title: spec.title, version: spec.version, error: spec.error, missing: spec.missing, operationCount: spec.operations.length, operations: ops.slice(0, limit ?? DEFAULT_LIST) });
          }
        }
      }
      return out;
    }
  );

  define(
    'get_openapi_status',
    { title: 'OpenAPI generation status', description: 'Which components can generate an OpenAPI spec, spec files and the state of the last generation.', input: { project: projectArg } },
    async ({ project }) => {
      const p = resolveProject(host, project);
      return host.generation.info(p).map((i) => ({ component: p.components.find((c) => c.id === i.componentId)?.slug, canGenerate: i.canGenerate, specs: i.specs, state: i.status.state, message: i.status.message, operations: i.status.operations }));
    }
  );

  define(
    'sync_code_preview',
    {
      title: 'Preview code sync',
      description:
        'Analyse the code base of a component and match exported code functions with catalog features (code functions implement features; they are not features). Status per code function: linked (feature already points to it), proposed (an existing feature matches by mapping, file+name or name/entity/action; action link sets its source_file and calls), candidate (no feature; skipped unless sync_code_apply gets it in `create`, or link it yourself with update_catalog_entry source_file), stale (feature points to a file that is gone; unlink clears source_file). Nothing is written.',
      input: { project: projectArg, component: componentArg, limit: z.number().int().min(1).max(MAX_LIST).optional() },
    },
    async ({ project, component, limit }) => {
      const c = resolveComponent(resolveProject(host, project), component);
      return syncPreview(host, c, 'sync-code', limit ?? DEFAULT_LIST);
    }
  );

  define(
    'sync_schema_preview',
    {
      title: 'Preview Prisma schema sync',
      description: 'Match Prisma models of a component with catalog business objects. Nothing is written.',
      input: { project: projectArg, component: componentArg, limit: z.number().int().min(1).max(MAX_LIST).optional() },
    },
    async ({ project, component, limit }) => {
      const c = resolveComponent(resolveProject(host, project), component);
      return syncPreview(host, c, 'sync-schema', limit ?? DEFAULT_LIST);
    }
  );

  define(
    'apply_plan',
    {
      title: 'Apply a plan',
      write: true,
      description:
        'Write several catalog changes at once (same `changes` as validate_plan: upserts and deletes of features, business objects, workflows). The plan is checked as a whole, so entries that reference each other can be written together in any order. Nothing is written if the plan adds errors (the issues are returned); a failed write rolls back the changes already made. `component` is required for new entries.',
      input: { project: projectArg, changes: z.array(planChangeSchema).min(1).max(200) },
    },
    async ({ project, changes }) => {
      const p = resolveProject(host, project);
      const body = changes.map((ch) => ({ ...ch, component: ch.component ? resolveComponent(p, ch.component).id : undefined }));
      const res = (await api(host, 'POST', '/api/apply-plan', { changes: body })) as { applied: { kind: string; op: string; id: string; created: boolean }[]; warnings: Issue[] };
      await host.changed?.();
      return { applied: res.applied, warnings: projectView(p, res.warnings, true) };
    }
  );

  define(
    'update_project',
    {
      title: 'Update the product context',
      write: true,
      description:
        'Change name, description, vision, goals, actors, glossary or tracker of a project (product-creator.yml). A list replaces the whole list ([] clears it); tracker: null removes it. Goal ids are G1, G2, …; actor ids use a-z, 0-9 and _.',
      input: {
        project: projectArg,
        name: z.string().optional(),
        description: z.string().optional(),
        vision: z.string().optional(),
        goals: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
        actors: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().optional() })).optional(),
        glossary: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
        tracker: z.object({ issueUrl: z.string() }).nullable().optional(),
      },
    },
    async ({ project, ...patch }) => {
      const p = resolveProject(host, project);
      const next = updateProject(p.root, patch);
      await host.changed?.();
      return { updated: next.slug, changed: Object.keys(patch) };
    }
  );

  define(
    'create_catalog_entry',
    {
      title: 'Create a catalog entry',
      write: true,
      description: 'Create a feature (id = <bounded_context>.<entity>.<action>), business object, workflow or stream in a component catalog. `data` is the full card (see get_schema for its fields, including the spec of a feature). It is validated before writing (schema and model: references to features/objects, field types, duplicates); a change that adds errors is rejected with the issues. Use validate_plan / find_duplicates first.',
      input: { project: projectArg, component: componentArg, kind: kindSchema, data: z.record(z.string(), z.unknown()) },
    },
    async ({ project, component, kind: kindArg, data }) => {
      const kind = kindOf(kindArg);
      const p = resolveProject(host, project);
      const c = resolveComponent(p, component);
      const id = KINDS[kind].idOf(data);
      if (typeof id !== 'string' || !id) throw new ToolError(`data.${kind === 'workflow' ? 'workflow' : kind === 'stream' ? 'stream' : 'id'} is required`);
      for (const other of p.components) {
        if ((await listEntries(host, kind, other)).some((e) => KINDS[kind].idOf(e) === id)) throw new ToolError(`${kind} "${id}" already exists (component ${other.slug})`);
      }
      await api(host, 'POST', KINDS[kind].save, { [KINDS[kind].key]: data, appId: c.id });
      await host.changed?.();
      return { created: id, component: c.slug };
    }
  );

  define(
    'update_catalog_entry',
    {
      title: 'Update a catalog entry',
      write: true,
      description: 'Change fields of an existing entry. `patch` is merged into the stored card at the top level (a null value removes a field); the id cannot change. The result is validated before writing; a change that adds model errors is rejected with the issues.',
      input: { project: projectArg, kind: kindSchema, id: z.string(), patch: z.record(z.string(), z.unknown()), component: componentArg.optional() },
    },
    async ({ project, kind: kindArg, id, patch, component }) => {
      const kind = kindOf(kindArg);
      const p = resolveProject(host, project);
      let found: { c: ComponentModel; entry: Rec } | undefined;
      for (const c of component ? [resolveComponent(p, component)] : p.components) {
        const entry = (await listEntries(host, kind, c)).find((e) => KINDS[kind].idOf(e) === id);
        if (entry) {
          found = { c, entry };
          break;
        }
      }
      if (!found) throw new ToolError(`${kind} "${id}" not found in project ${p.slug}`);
      const merged: Rec = { ...found.entry };
      delete merged.childObjects; // grouping of the business-object list, not part of the card
      const changed: string[] = [];
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
        changed.push(k);
      }
      if (KINDS[kind].idOf(merged) !== id) throw new ToolError('The id of an entry cannot be changed');
      await api(host, 'POST', KINDS[kind].save, { [KINDS[kind].key]: merged, appId: found.c.id });
      await host.changed?.();
      return { updated: id, component: found.c.slug, fields: changed };
    }
  );

  define(
    'sync_code_apply',
    {
      title: 'Sync catalog from code',
      write: true,
      description:
        'Apply the code sync: link proposed code functions to their features (source_file, calls). Candidates are not turned into features unless their keys (`<file>:<name>` from sync_code_preview) are listed in `create`. Stale links are kept unless allow_unlink is true. Features are never marked removed. Run sync_code_preview first.',
      input: {
        project: projectArg,
        component: componentArg,
        create: z.array(z.string()).max(500).optional().describe('Keys of candidate code functions to create draft features for'),
        allow_unlink: z.boolean().optional().describe('Clear source_file of stale features'),
        allow_delete: z.boolean().optional().describe('Old name of allow_unlink'),
      },
    },
    async ({ project, component, create, allow_unlink, allow_delete }) =>
      syncApply(host, resolveComponent(resolveProject(host, project), component), 'sync-code', allow_unlink === true || allow_delete === true, create ?? [])
  );

  define(
    'sync_schema_apply',
    {
      title: 'Sync business objects from Prisma schema',
      write: true,
      description: 'Run the Prisma schema sync with the matcher\'s default actions. Deletions are skipped unless allow_delete is true.',
      input: { project: projectArg, component: componentArg, allow_delete: z.boolean().optional() },
    },
    async ({ project, component, allow_delete }) => syncApply(host, resolveComponent(resolveProject(host, project), component), 'sync-schema', allow_delete === true)
  );

  define(
    'generate_openapi',
    {
      title: 'Generate OpenAPI specs',
      write: true,
      description: 'Run the configured OpenAPI generate command of one component, or of all components of the project that have one. The command is exactly the one saved in the component settings.',
      input: { project: projectArg, component: componentArg.optional() },
    },
    async ({ project, component }) => {
      const p = resolveProject(host, project);
      const results = component ? [await host.generation.generate(p, resolveComponent(p, component))] : await host.generation.generateAll(p);
      await host.changed?.();
      return results.map((r) => ({ component: p.components.find((c) => c.id === r.componentId)?.slug, state: r.state, message: r.message, operations: r.operations, exitCode: r.exitCode, logTail: r.log.slice(-600) }));
    }
  );
}
