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
    expect(names).toEqual(expect.arrayContaining(['list_projects', 'list_components', 'list_catalog', 'get_catalog_entry', 'sync_code_preview', 'create_catalog_entry', 'update_catalog_entry', 'sync_code_apply', 'generate_openapi']));
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

  it('previews a code sync without writing, then applies it', async () => {
    write('svc/src/orders.ts', 'export function createOrder(id: string) { return id; }\n');
    const { client } = await connect(bearer());
    const before = json(await client.callTool({ name: 'list_catalog', arguments: { project: project.slug, kind: 'feature' } })).total;
    const preview = json(await client.callTool({ name: 'sync_code_preview', arguments: { project: project.slug, component: 'svc' } }));
    expect(preview.items.some((i: { name: string; file: string }) => i.name === 'createOrder' && i.file.endsWith('orders.ts'))).toBe(true);
    const unchanged = json(await client.callTool({ name: 'list_catalog', arguments: { project: project.slug, kind: 'feature' } })).total;
    expect(unchanged).toBe(before);

    const applied = await client.callTool({ name: 'sync_code_apply', arguments: { project: project.slug, component: 'svc' } });
    expect(applied.isError).toBeFalsy();
    const after = json(await client.callTool({ name: 'list_catalog', arguments: { project: project.slug, kind: 'feature', query: 'createOrder' } }));
    expect(after.total).toBeGreaterThanOrEqual(1);
    expect(after.items[0].name).toBe('createOrder');
    expect(after.items[0].source_file).toContain('orders.ts');
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
