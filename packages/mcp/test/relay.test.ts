import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { WebSocketServer, type WebSocket } from 'ws';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openProject, toStorageEntities, PROJECT_FILE } from '@pc/core/project/model';
import { configureStorage, resetStorage } from '@pc/core/storage';
import { OpenApiGenerationManager } from '@pc/core/interfaces/generator';
import { ActionLog } from '../src/audit';
import type { McpHost } from '../src/host';
import { McpHttpServer } from '../src/server';
import { RelayClient, type RelayStatus } from '../src/relay/client';
import { decodeFrame, encodeFrame, FrameFlag, FrameType, WS_SUBPROTOCOL, type Frame } from '../src/relay/frames';

const DEVICE_KEY = 'rld_device1.secret';
const RELAY_KEY = 'in-process-relay-key';
const LOCAL_TOKEN = 'pc_local_token';

describe('frame codec', () => {
  it('round-trips headers, flags and body', () => {
    const buf = encodeFrame({ type: FrameType.RES_HEADERS, streamId: 7, flags: FrameFlag.END_STREAM, header: { status: 202, headers: {} }, body: Buffer.from('abc') });
    expect(buf.readUInt8(0)).toBe(1);
    expect(buf.readUInt32BE(2)).toBe(7);
    const f = decodeFrame(buf);
    expect(f).toMatchObject({ type: FrameType.RES_HEADERS, streamId: 7, flags: 1, header: { status: 202, headers: {} } });
    expect(f.body.toString()).toBe('abc');
  });

  it('rejects malformed frames', () => {
    expect(() => decodeFrame(Buffer.alloc(3))).toThrow();
    const bad = encodeFrame({ type: FrameType.PING });
    bad.writeUInt8(2, 0);
    expect(() => decodeFrame(bad)).toThrow(/version/);
    const lie = encodeFrame({ type: FrameType.PING, header: { a: 1 } });
    lie.writeUInt32BE(999, 7);
    expect(() => decodeFrame(lie)).toThrow(/length/);
  });
});

// ── fake relay ─────────────────────────────────────────────────────────────────

class FakeRelay {
  http = http.createServer();
  wss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => (protocols.has(WS_SUBPROTOCOL) ? WS_SUBPROTOCOL : false) });
  sockets: WebSocket[] = [];
  frames: Frame[] = [];
  upgrades: { auth?: string; protocol?: string }[] = [];
  rejectStatus?: number;
  waiters: (() => void)[] = [];
  port = 0;

  async start() {
    this.http.on('upgrade', (req, socket, head) => {
      this.upgrades.push({ auth: req.headers.authorization, protocol: String(req.headers['sec-websocket-protocol']) });
      if (this.rejectStatus) {
        socket.write(`HTTP/1.1 ${this.rejectStatus} X\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        return socket.destroy();
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.sockets.push(ws);
        ws.on('message', (data: Buffer) => {
          const f = decodeFrame(data);
          this.frames.push(f);
          if (f.type === FrameType.HELLO) {
            ws.send(encodeFrame({ type: FrameType.WELCOME, header: { sessionId: 's1', deviceId: 'device1', publicUrl: 'https://relay.example/d/abcdefghij/mcp', heartbeatSec: 25, limits: { maxFrameBody: 65536, maxRequestBody: 4194304, maxResponseBody: 16777216, maxStreams: 32, initialWindow: 262144 } } }));
          }
          for (const w of this.waiters.splice(0)) w();
        });
      });
    });
    await new Promise<void>((r) => this.http.listen(0, '127.0.0.1', () => r()));
    this.port = (this.http.address() as { port: number }).port;
  }
  get url() {
    return `ws://127.0.0.1:${this.port}/tunnel`;
  }
  get socket() {
    return this.sockets[this.sockets.length - 1];
  }
  async until(cond: () => boolean, ms = 3000) {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) throw new Error('timeout waiting for condition');
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 25);
      });
    }
  }
  /** Send a bot request and collect the response of this stream */
  async request(streamId: number, opts: { method?: string; path?: string; scope?: 'READ' | 'READ_WRITE'; headers?: Record<string, string>; body?: unknown; ua?: string }) {
    const body = opts.body === undefined ? undefined : Buffer.from(JSON.stringify(opts.body));
    this.socket.send(
      encodeFrame({
        type: FrameType.REQ_HEADERS,
        streamId,
        flags: body ? 0 : FrameFlag.END_STREAM,
        header: {
          method: opts.method ?? 'POST',
          path: opts.path ?? '/mcp',
          query: '',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...opts.headers },
          token: { id: 'bot-7', scope: opts.scope ?? 'READ' },
          client: { ua: opts.ua ?? 'ChatGPT-User' },
          deadlineMs: 20000,
        },
      })
    );
    if (body) this.socket.send(encodeFrame({ type: FrameType.REQ_BODY, streamId, flags: FrameFlag.END_STREAM, body }));
    await this.until(() => this.frames.some((f) => f.streamId === streamId && f.type === FrameType.RST_STREAM) || this.frames.some((f) => f.streamId === streamId && f.type === FrameType.RES_BODY && (f.flags & 1) === 1) || this.frames.some((f) => f.streamId === streamId && f.type === FrameType.RES_HEADERS && (f.flags & 1) === 1));
    const mine = this.frames.filter((f) => f.streamId === streamId);
    const head = mine.find((f) => f.type === FrameType.RES_HEADERS);
    const text = Buffer.concat(mine.filter((f) => f.type === FrameType.RES_BODY).map((f) => f.body)).toString();
    return { status: (head?.header?.status as number) ?? 0, headers: (head?.header?.headers ?? {}) as Record<string, string>, text, rst: mine.find((f) => f.type === FrameType.RST_STREAM) };
  }
  async stop() {
    for (const s of this.sockets) s.terminate();
    this.wss.close();
    await new Promise<void>((r) => this.http.close(() => r()));
  }
}

let root: string;
let mcp: McpHttpServer;
let audit: ActionLog;
let relay: FakeRelay;
let client: RelayClient;
let statuses: RelayStatus[];
let localEnabled = true;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-relay-'));
  process.env.PC_LOG_DIR = path.join(root, '.logs-outside');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo","private":true}');
  fs.mkdirSync(path.join(root, 'svc'));
  fs.writeFileSync(path.join(root, 'svc/package.json'), '{"name":"svc"}');
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - svc\n');
  const project = openProject(root).project;
  await resetStorage();
  configureStorage({ manifest: { ...toStorageEntities([project]), source: PROJECT_FILE } });
  const host: McpHost = { projects: () => [project], api: async () => ({ status: 404, body: '{}' }), generation: new OpenApiGenerationManager() };
  audit = new ActionLog();
  mcp = new McpHttpServer({ host, token: LOCAL_TOKEN, scope: 'read', port: 0, audit, relayKey: RELAY_KEY });
  await mcp.start();
});
afterAll(async () => {
  await mcp.stop();
  await resetStorage();
  fs.rmSync(root, { recursive: true, force: true });
});

const timing = { backoffMinMs: 20, backoffMaxMs: 80, pingMs: 60_000, random: () => 0 };
const newClient = (overrides: Partial<ConstructorParameters<typeof RelayClient>[0]> = {}) =>
  new RelayClient({ url: relay.url, deviceKey: DEVICE_KEY, relayKey: RELAY_KEY, localUrl: () => (localEnabled ? mcp.url : undefined), clientName: 'product-creator/test', onStatus: (s) => statuses.push(s), timing, ...overrides });

beforeEach(async () => {
  statuses = [];
  localEnabled = true;
  relay = new FakeRelay();
  await relay.start();
});
afterEach(async () => {
  client?.stop();
  await relay.stop();
});

const rpc = (id: number, method: string, params: unknown = {}) => ({ jsonrpc: '2.0', id, method, params });
const init = rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bot', version: '1' } });
const parse = (text: string) => JSON.parse(text.startsWith('event:') ? text.split('\n').find((l) => l.startsWith('data:'))!.slice(5) : text);

describe('handshake', () => {
  it('connects with the device key and subprotocol, says HELLO and goes online', async () => {
    client = newClient();
    client.start();
    await relay.until(() => relay.frames.some((f) => f.type === FrameType.HELLO));
    expect(relay.upgrades[0]).toEqual({ auth: `Bearer ${DEVICE_KEY}`, protocol: WS_SUBPROTOCOL });
    const hello = relay.frames.find((f) => f.type === FrameType.HELLO)!;
    expect(hello.header).toMatchObject({ protocol: [1], client: 'product-creator/test' });
    await relay.until(() => client.status().state === 'online');
    expect(client.status()).toMatchObject({ state: 'online', publicUrl: 'https://relay.example/d/abcdefghij/mcp', deviceId: 'device1' });
  });

  it('401 on upgrade: invalid key, no retry loop', async () => {
    relay.rejectStatus = 401;
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'invalid_key');
    await new Promise((r) => setTimeout(r, 200));
    expect(relay.upgrades.length).toBe(1);
    expect(JSON.stringify(client.status())).not.toContain(DEVICE_KEY);
  });

  it('503 on upgrade: retries with backoff', async () => {
    relay.rejectStatus = 503;
    client = newClient();
    client.start();
    await relay.until(() => relay.upgrades.length >= 2);
    relay.rejectStatus = undefined;
    await relay.until(() => client.status().state === 'online');
  });

  it('reconnects after the relay closes with 1001', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    relay.socket.close(1001, 'restart');
    await relay.until(() => relay.sockets.length === 2 && client.status().state === 'online');
  });

  it('close 4004 (revoked) and 4003 (replaced): no reconnect', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    relay.socket.close(4004, 'revoked');
    await relay.until(() => client.status().state === 'revoked');
    await new Promise((r) => setTimeout(r, 200));
    expect(relay.sockets.length).toBe(1);

    client.stop();
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online' && relay.sockets.length === 2);
    relay.socket.close(4003, 'replaced');
    await relay.until(() => client.status().state === 'replaced');
  });

  it('GOAWAY revoked stops, GOAWAY shutdown reconnects after the given delay', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    relay.socket.send(encodeFrame({ type: FrameType.GOAWAY, header: { reason: 'shutdown', reconnectAfterMs: 150 } }));
    const t0 = Date.now();
    await relay.until(() => relay.sockets.length === 2 && client.status().state === 'online');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
    relay.socket.send(encodeFrame({ type: FrameType.GOAWAY, header: { reason: 'revoked', reconnectAfterMs: 0 } }));
    await relay.until(() => client.status().state === 'revoked');
  });

  it('answers PING with PONG and sends its own PING', async () => {
    client = newClient({ timing: { ...timing, pingMs: 40 } });
    client.start();
    await relay.until(() => client.status().state === 'online');
    relay.socket.send(encodeFrame({ type: FrameType.PING, header: { n: 5 } }));
    await relay.until(() => relay.frames.some((f) => f.type === FrameType.PONG && f.header?.n === 5));
    await relay.until(() => relay.frames.some((f) => f.type === FrameType.PING));
  });
});

describe('relayed requests', () => {
  it('serves an MCP session; READ scope has no write tools; the bot is audited with its User-Agent', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');

    const r1 = await relay.request(1, { body: init, scope: 'READ' });
    expect(r1.status).toBe(200);
    expect(r1.headers['content-type']).toContain('application/json');
    const sid = r1.headers['mcp-session-id'];
    expect(sid).toBeTruthy();
    expect(parse(r1.text).result.serverInfo.name).toBe('product-creator');

    const r2 = await relay.request(2, { body: { jsonrpc: '2.0', method: 'notifications/initialized' }, headers: { 'mcp-session-id': sid } });
    expect(r2.status).toBe(202);

    const r3 = await relay.request(3, { body: rpc(2, 'tools/list'), headers: { 'mcp-session-id': sid } });
    const names = parse(r3.text).result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('list_projects');
    expect(names).not.toContain('create_catalog_entry');

    const r4 = await relay.request(4, { body: rpc(3, 'tools/call', { name: 'list_projects', arguments: {} }), headers: { 'mcp-session-id': sid } });
    expect(parse(r4.text).result.content[0].text).toContain('"components": 1');
    expect(audit.recent(20).find((e) => e.principal === 'relay:bot-7' && e.userAgent === 'ChatGPT-User' && e.action === 'list_projects')).toBeTruthy();
  });

  it('READ_WRITE token sees write tools', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    const r1 = await relay.request(11, { body: init, scope: 'READ_WRITE' });
    const sid = r1.headers['mcp-session-id'];
    const r3 = await relay.request(12, { body: rpc(2, 'tools/list'), scope: 'READ_WRITE', headers: { 'mcp-session-id': sid } });
    expect(parse(r3.text).result.tools.map((t: { name: string }) => t.name)).toContain('create_catalog_entry');
  });

  it('cannot escalate the scope with forged headers (only the allow-list is forwarded)', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    const forged = { 'x-pc-relay-scope': 'READ_WRITE', authorization: `Bearer ${LOCAL_TOKEN}`, host: 'evil' };
    const r1 = await relay.request(21, { body: init, scope: 'READ', headers: forged });
    const sid = r1.headers['mcp-session-id'];
    const r3 = await relay.request(22, { body: rpc(2, 'tools/list'), scope: 'READ', headers: { 'mcp-session-id': sid, ...forged } });
    expect(parse(r3.text).result.tools.map((t: { name: string }) => t.name)).not.toContain('create_catalog_entry');
  });

  it('serves only /mcp', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    const r = await relay.request(31, { path: '/admin', body: init });
    expect(r.status).toBe(404);
    expect(r.headers['content-type']).toBe('application/json');
    const m = await relay.request(32, { method: 'PUT', body: init });
    expect(m.status).toBe(405);
  });

  it('answers 503 JSON-RPC error while the local MCP server is off', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    localEnabled = false;
    const r = await relay.request(41, { body: init });
    expect(r.status).toBe(503);
    expect(JSON.parse(r.text).error.data.code).toBe('local_mcp_disabled');
  });

  it('resets a stream that reuses an open stream id', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    // a stream id may not be reused while open: open one with a pending body
    relay.socket.send(encodeFrame({ type: FrameType.REQ_HEADERS, streamId: 51, flags: 0, header: { method: 'POST', path: '/mcp', headers: {}, token: { id: 'b', scope: 'READ' } } }));
    relay.socket.send(encodeFrame({ type: FrameType.REQ_HEADERS, streamId: 51, flags: 0, header: { method: 'POST', path: '/mcp', headers: {}, token: { id: 'b', scope: 'READ' } } }));
    await relay.until(() => relay.frames.some((f) => f.type === FrameType.RST_STREAM && f.streamId === 51 && f.header?.code === 'PROTOCOL'));
  });

  it('a relay RST_STREAM stops the stream', async () => {
    client = newClient();
    client.start();
    await relay.until(() => client.status().state === 'online');
    relay.socket.send(encodeFrame({ type: FrameType.REQ_HEADERS, streamId: 61, flags: 0, header: { method: 'POST', path: '/mcp', headers: {}, token: { id: 'b', scope: 'READ' } } }));
    await relay.until(() => client.status().activeStreams === 1);
    relay.socket.send(encodeFrame({ type: FrameType.RST_STREAM, streamId: 61, header: { code: 'CANCELLED' } }));
    await relay.until(() => client.status().activeStreams === 0);
  });
});
