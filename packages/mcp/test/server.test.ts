import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openProject, toStorageEntities, PROJECT_FILE, type ProjectModel } from '@pc/core/project/model';
import { configureStorage, resetStorage } from '@pc/core/storage';
import { OpenApiGenerationManager } from '@pc/core/interfaces/generator';
import { ActionLog } from '../src/audit';
import type { McpHost } from '../src/host';
import { McpHttpServer, RELAY_HEADERS } from '../src/server';

const TOKEN = 'pc_test_token';
const RELAY_KEY = 'internal-relay-key';

let root: string;
let project: ProjectModel;
let server: McpHttpServer;
let audit: ActionLog;
let scope: 'read' | 'write' = 'write';

function write(rel: string, content: string | object) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-mcp-'));
  process.env.PC_LOG_DIR = path.join(root, '.logs-outside');
  write('package.json', { name: 'demo', private: true });
  write('pnpm-workspace.yaml', 'packages:\n  - svc\n  - packages/*\n');
  write('svc/package.json', { name: 'svc' });
  write('packages/lib/package.json', { name: 'lib' });
  project = openProject(root).project;
  await resetStorage();
  configureStorage({ manifest: { ...toStorageEntities([project]), source: PROJECT_FILE } });
  const generation = new OpenApiGenerationManager();
  const host: McpHost = {
    projects: () => [project],
    api: async (req) => {
      const { dispatch } = await import('@pc/core/http/router');
      const res = await dispatch(new Request(new URL(req.url, 'http://pc.local'), { method: req.method, body: req.body, headers: { 'content-type': 'application/json' } }));
      return { status: res.status, body: await res.text() };
    },
    generation,
  };
  audit = new ActionLog();
  server = new McpHttpServer({ host, token: TOKEN, scope: 'write', port: 0, audit, relayKey: RELAY_KEY });
  await server.start();
});

afterAll(async () => {
  await server.stop();
  await resetStorage();
  fs.rmSync(root, { recursive: true, force: true });
});

async function connect(headers: Record<string, string>) {
  const client = new Client({ name: 'test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers } });
  await client.connect(transport);
  return { client, transport };
}
const bearer = (token = TOKEN) => ({ authorization: `Bearer ${token}` });
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);
const json = (r: unknown) => JSON.parse(text(r));

function rawRequest(headers: Record<string, string>, method = 'POST', body = '{}'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, path: '/mcp', method, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.end(method === 'GET' ? undefined : body);
  });
}

const FN = { id: 'billing.invoice.create', name: 'Create invoice', bounded_context: 'billing', entity: 'invoice', action: 'create', owner: 'team-a', lifecycle: 'draft', source_file: 'svc/src/invoice.ts' };

describe('authentication and transport', () => {
  it('rejects requests without or with a wrong token', async () => {
    expect((await rawRequest({})).status).toBe(401);
    expect((await rawRequest(bearer('nope'))).status).toBe(401);
    expect(audit.recent().some((e) => e.action === 'auth' && e.outcome === 'denied')).toBe(true);
  });

  it('rejects a foreign Host header (DNS rebinding)', async () => {
    expect((await rawRequest({ ...bearer(), host: 'evil.example:80' })).status).toBe(403);
  });

  it('requires initialize before any other call', async () => {
    const res = await rawRequest(bearer(), 'POST', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(res.status).toBe(400);
  });

  it('answers only on /mcp', async () => {
    const res = await new Promise<number>((resolve) => http.get({ host: '127.0.0.1', port: server.port, path: '/' }, (r) => { r.resume(); resolve(r.statusCode ?? 0); }));
    expect(res).toBe(404);
  });
});

describe('tools (read-write token)', () => {
  it('lists the tools including write tools', async () => {
    const { client } = await connect(bearer());
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_projects', 'list_components', 'list_catalog', 'get_catalog_entry', 'get_object', 'find_duplicates', 'impact_of_change', 'validate_plan', 'validate_catalog', 'sync_code_preview', 'create_catalog_entry', 'update_catalog_entry', 'sync_code_apply', 'generate_openapi']));
    await client.close();
  });

  it('reads projects and components', async () => {
    const { client } = await connect(bearer());
    const projects = json(await client.callTool({ name: 'list_projects', arguments: {} }));
    expect(projects[0]).toMatchObject({ id: project.id, components: 2 });
    const components = json(await client.callTool({ name: 'list_components', arguments: { project: project.slug, kind: 'library' } }));
    expect(components.map((c: { slug: string }) => c.slug)).toEqual(['packages-lib']);
    const unknown = await client.callTool({ name: 'list_components', arguments: { project: '/etc' } });
    expect(unknown.isError).toBe(true);
    await client.close();
  });

  it('creates, lists, reads and updates a feature with a source_file link', async () => {
    const { client } = await connect(bearer());
    const created = await client.callTool({ name: 'create_catalog_entry', arguments: { project: project.slug, component: 'svc', kind: 'feature', data: FN } });
    expect(created.isError).toBeFalsy();
    expect(fs.existsSync(path.join(root, project.components.find((c) => c.slug === 'svc')!.catalog, 'features', 'billing', 'invoice.create.yml'))).toBe(true);

    const dup = await client.callTool({ name: 'create_catalog_entry', arguments: { project: project.slug, component: 'svc', kind: 'feature', data: FN } });
    expect(dup.isError).toBe(true);
    expect(text(dup)).toContain('already exists');

    const list = json(await client.callTool({ name: 'list_catalog', arguments: { project: project.slug, kind: 'feature', query: 'invoice' } }));
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ id: FN.id, component: 'svc', source_file: FN.source_file });

    const updated = await client.callTool({ name: 'update_catalog_entry', arguments: { project: project.slug, kind: 'feature', id: FN.id, patch: { lifecycle: 'active', description: 'Creates an invoice' } } });
    expect(updated.isError).toBeFalsy();
    // 'function' is the old name of the kind, still accepted (PRODUCTCREATOR-28)
    const got = json(await client.callTool({ name: 'get_catalog_entry', arguments: { project: project.slug, kind: 'function', id: FN.id } }));
    expect(got.entry).toMatchObject({ lifecycle: 'active', description: 'Creates an invoice', source_file: FN.source_file });

    const renamed = await client.callTool({ name: 'update_catalog_entry', arguments: { project: project.slug, kind: 'feature', id: FN.id, patch: { id: 'x.y.z' } } });
    expect(renamed.isError).toBe(true);
    const invalid = await client.callTool({ name: 'update_catalog_entry', arguments: { project: project.slug, kind: 'feature', id: FN.id, patch: { lifecycle: 'bogus' } } });
    expect(invalid.isError).toBe(true);
    await client.close();
  });

  it('checks plans against the model and rejects writes that break it (PRODUCTCREATOR-29)', async () => {
    const { client } = await connect(bearer());
    const call = async (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: { project: project.slug, ...args } });
    const invoice = { id: 'invoice', name: 'Invoice', owner: 'team-a', lifecycle: 'draft', fields: [{ name: 'id', type: 'string' }, { name: 'total', type: 'decimal' }] };

    const plan = json(await call('validate_plan', { changes: [{ kind: 'workflow', data: { workflow: 'billing.close', steps: ['billing.invoice.create', 'billing.invoice.send'] }, component: 'svc' }] }));
    expect(plan.ok).toBe(false);
    expect(plan.introduced).toEqual([expect.objectContaining({ code: 'unknown_feature', field: 'steps[1]', component: 'svc' })]);

    const rejected = await call('create_catalog_entry', { component: 'svc', kind: 'workflow', data: { workflow: 'billing.close', steps: ['billing.invoice.send'] } });
    expect(rejected.isError).toBe(true);
    expect(text(rejected)).toContain('unknown_feature');

    const badLink = await call('update_catalog_entry', { kind: 'feature', id: FN.id, patch: { objects: [{ id: 'invoice', access: 'write' }] } });
    expect(badLink.isError).toBe(true);
    expect(text(badLink)).toContain('unknown_object');

    expect((await call('create_catalog_entry', { component: 'svc', kind: 'business_object', data: invoice })).isError).toBeFalsy();
    expect((await call('update_catalog_entry', { kind: 'feature', id: FN.id, patch: { objects: [{ id: 'invoice', access: 'write' }] } })).isError).toBeFalsy();
    expect((await call('create_catalog_entry', { component: 'svc', kind: 'workflow', data: { workflow: 'billing.close', steps: [FN.id] } })).isError).toBeFalsy();

    const object = json(await call('get_object', { id: 'invoice' }));
    expect(object.object.fields.map((f: { name: string }) => f.name)).toEqual(['id', 'total']);
    expect(object.usedBy).toEqual([expect.objectContaining({ id: FN.id, via: 'objects: write', component: 'svc' })]);

    const impact = json(await call('impact_of_change', { kind: 'business_object', id: 'invoice' }));
    expect(impact.features.map((f: { id: string }) => f.id)).toEqual([FN.id]);
    expect(impact.workflows.map((w: { id: string }) => w.id)).toEqual(['billing.close']);

    const dups = json(await call('find_duplicates', { kind: 'feature', name: 'create invoice', id: 'sales.invoice.create' }));
    expect(dups.matches).toEqual([expect.objectContaining({ id: FN.id, via: 'same entity.action, same name' })]);

    const deletion = json(await call('validate_plan', { changes: [{ kind: 'function', op: 'delete', id: FN.id }] }));
    expect(deletion.ok).toBe(false);
    expect(deletion.introduced.map((i: { id: string }) => i.id)).toContain('billing.close');

    const catalog = json(await call('validate_catalog', {}));
    expect(catalog.errors).toBe(0);
    await client.close();
  });

  it('code sync links code functions to features and creates features only for named candidates (PRODUCTCREATOR-30)', async () => {
    write('svc/src/orders.ts', 'export function createOrder(id: string) { return confirmOrder(id); }\nexport function confirmOrder(id: string) { return id; }\n');
    const { client } = await connect(bearer());
    const call = async (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: { project: project.slug, ...args } });
    const order = { id: 'orders.order.create', name: 'Create order', bounded_context: 'orders', entity: 'order', action: 'create', owner: 'team-a', lifecycle: 'draft' };
    expect((await call('create_catalog_entry', { component: 'svc', kind: 'feature', data: order })).isError).toBeFalsy();
    const before = json(await call('list_catalog', { kind: 'feature' })).total;

    const preview = json(await call('sync_code_preview', { component: 'svc' }));
    const byName = Object.fromEntries(preview.items.map((i: { name: string }) => [i.name, i]));
    expect(byName.createOrder).toMatchObject({ status: 'proposed', action: 'link', id: 'orders.order.create' });
    expect(byName.confirmOrder).toMatchObject({ status: 'candidate', action: 'skip' });
    expect(json(await call('list_catalog', { kind: 'feature' })).total).toBe(before);

    const applied = json(await call('sync_code_apply', { component: 'svc' }));
    expect(applied.applied).toEqual({ link: 1 });
    expect(json(await call('list_catalog', { kind: 'feature' })).total).toBe(before);
    const linked = json(await call('get_catalog_entry', { kind: 'feature', id: 'orders.order.create' }));
    expect(linked.entry.source_file).toContain('orders.ts');
    expect(linked.entry.lifecycle).toBe('draft');

    const bad = await call('sync_code_apply', { component: 'svc', create: ['nope.ts:x'] });
    expect(bad.isError).toBe(true);
    const created = json(await call('sync_code_apply', { component: 'svc', create: [byName.confirmOrder.key] }));
    expect(created.applied).toEqual({ create: 1 });
    const confirm = json(await call('list_catalog', { kind: 'feature', query: 'confirmOrder' }));
    expect(confirm.total).toBe(1);
    expect(confirm.items[0].id).toMatch(/^[a-z0-9_]+\.[a-z0-9_]+\.confirm_order$/);

    const again = json(await call('sync_code_preview', { component: 'svc' }));
    // billing.invoice.create points to svc/src/invoice.ts, which does not exist: stale, kept unless allow_unlink
    expect(again.items.filter((i: { status: string }) => i.status !== 'linked').map((i: { name: string; status: string }) => `${i.status}:${i.name}`)).toEqual(['stale:Create invoice']);
    expect(json(await call('sync_code_apply', { component: 'svc' })).skippedDeletes).toBe(1);
    expect(json(await call('sync_code_apply', { component: 'svc', allow_unlink: true })).applied).toEqual({ unlink: 1 });
    const unlinked = json(await call('get_catalog_entry', { kind: 'feature', id: FN.id }));
    expect(unlinked.entry.source_file).toBeUndefined();
    expect(unlinked.entry.lifecycle).not.toBe('removed');
    await client.close();
  });

  it('records tool calls in the action log without secrets', async () => {
    const entries = audit.recent(100);
    const create = entries.find((e) => e.action === 'create_catalog_entry' && e.outcome === 'ok');
    expect(create).toMatchObject({ principal: 'local', scope: 'write', write: true });
    expect(JSON.stringify(entries)).not.toContain(TOKEN);
  });
});

describe('scope and callers', () => {
  it('read-only relay token: no write tools, session bound to the caller', async () => {
    const relay = { authorization: `Bearer ${RELAY_KEY}`, [RELAY_HEADERS.token]: 'bot-1', [RELAY_HEADERS.scope]: 'READ', [RELAY_HEADERS.userAgent]: 'ChatGPT-User' };
    const { client, transport } = await connect(relay);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('list_projects');
    expect(names).not.toContain('create_catalog_entry');
    expect(names).not.toContain('generate_openapi');
    const denied = await client.callTool({ name: 'create_catalog_entry', arguments: { project: project.slug, component: 'svc', kind: 'feature', data: FN } });
    expect(denied.isError).toBe(true);
    await client.callTool({ name: 'list_projects', arguments: {} });
    expect(audit.recent(50).find((e) => e.principal === 'relay:bot-1' && e.userAgent === 'ChatGPT-User' && e.action === 'list_projects')).toBeTruthy();

    // the local token cannot ride on the relay session
    const hijack = await rawRequest({ ...bearer(), 'mcp-session-id': transport.sessionId ?? '' }, 'POST', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(hijack.status).toBe(404);
    await client.close();
  });

  it('the relay headers are ignored with the local token (no scope escalation)', async () => {
    scope = 'read';
    server.configure({ scope });
    const { client } = await connect({ ...bearer(), [RELAY_HEADERS.scope]: 'READ_WRITE' });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain('create_catalog_entry');
    await client.close();
  });

  it('changing the token ends local sessions', async () => {
    server.configure({ scope: 'write' });
    const { client, transport } = await connect(bearer());
    server.configure({ token: 'rotated' });
    const res = await rawRequest({ ...bearer('rotated'), 'mcp-session-id': transport.sessionId ?? '' }, 'POST', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(res.status).toBe(404);
    expect((await rawRequest(bearer())).status).toBe(401);
    server.configure({ token: TOKEN });
    await client.close().catch(() => undefined);
  });
});
