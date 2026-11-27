import * as path from 'path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ComponentModel, ProjectModel } from '@pc/core/project/model';
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
    const err = json as { error?: string; details?: unknown } | undefined;
    const details = err?.details ? ` ${JSON.stringify(err.details)}` : '';
    throw new ToolError(`${err?.error ?? `HTTP ${res.status}`}${details}`);
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
      return { key: `${ef.relativePath}:${ef.name}`, name: String(ef.name), file: String(ef.relativePath), status: m.status, action: m.action, id: m.functionId, changes: m.changes };
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

async function syncApply(host: McpHost, component: ComponentModel, kind: 'sync-code' | 'sync-schema', allowDelete: boolean) {
  const start = (await api(host, 'POST', `/api/apps/${component.id}/${kind}/start`, {})) as { syncId?: string };
  if (!start.syncId) throw new ToolError('Sync did not start');
  const state = await pollSync(host, component.id, kind, start.syncId, ['matching']);
  const items = syncItems(kind, state);
  const overrides: Record<string, string> = {};
  let skippedDeletes = 0;
  if (!allowDelete) {
    for (const i of items) {
      if (i.action === 'delete') {
        overrides[i.key] = 'skip';
        skippedDeletes++;
      }
    }
  }
  await api(host, 'POST', `/api/apps/${component.id}/${kind}/actions`, { syncId: start.syncId, actions: overrides });
  await api(host, 'POST', `/api/apps/${component.id}/${kind}/execute`, { syncId: start.syncId });
  await pollSync(host, component.id, kind, start.syncId, ['completed']);
  await host.changed?.();
  const applied = items.filter((i) => overrides[i.key] === undefined);
  return { syncId: start.syncId, applied: countBy(applied), skippedDeletes, note: skippedDeletes ? 'delete actions were skipped; pass allow_delete=true to apply them' : undefined };
}

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
      description: 'Analyse the code base of a component and match exported code functions with catalog features. Nothing is written; returns what sync_code_apply would do.',
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
    'create_catalog_entry',
    {
      title: 'Create a catalog entry',
      write: true,
      description: 'Create a feature (id = <bounded_context>.<entity>.<action>), business object, workflow or stream in a component catalog. `data` is the full card; it is validated before writing.',
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
      description: 'Change fields of an existing entry. `patch` is merged into the stored card at the top level (a null value removes a field); the id cannot change. The result is validated before writing.',
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
      description: 'Run the code sync with the matcher\'s default actions (create/update features from exported code functions, set source_file). Deletions are skipped unless allow_delete is true. Run sync_code_preview first.',
      input: { project: projectArg, component: componentArg, allow_delete: z.boolean().optional() },
    },
    async ({ project, component, allow_delete }) => syncApply(host, resolveComponent(resolveProject(host, project), component), 'sync-code', allow_delete === true)
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
