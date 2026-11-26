import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { ActionLog } from './audit.js';
import type { McpHost, McpScope, Principal } from './host.js';
import { registerTools } from './tools.js';

export const MCP_PATH = '/mcp';
/** Headers the relay client sets when it forwards a bot request (honoured only with the in-process relay key) */
export const RELAY_HEADERS = { token: 'x-pc-relay-token', scope: 'x-pc-relay-scope', userAgent: 'x-pc-relay-ua' } as const;

const MAX_BODY = 4 * 1024 * 1024;
const MAX_SESSIONS = 50;
const SESSION_IDLE_MS = 30 * 60 * 1000;

export interface McpHttpServerOptions {
  host: McpHost;
  /** Bearer token of local clients */
  token: string;
  /** Scope of the local token */
  scope: McpScope;
  /** 0 = pick a free port (tests) */
  port: number;
  audit?: ActionLog;
  /** Application version reported in `initialize` */
  version?: string;
  /**
   * Secret known only to the in-process relay client. A request that carries it may assert the scope and
   * identity of the remote bot token (the relay strips and checks the real bot token). The scope that
   * applies is the stricter of that token scope and the local `scope` setting.
   */
  relayKey?: string;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  principalId: string;
  lastSeen: number;
}

const digest = (value: string) => createHash('sha256').update(value).digest();
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * MCP over Streamable HTTP on 127.0.0.1: bearer token, scope read/write, stateful sessions bound to the
 * caller, every tool call in the action log. Tools only see projects the host reports as open.
 */
export class McpHttpServer {
  readonly audit: ActionLog;
  private httpServer?: http.Server;
  private sessions = new Map<string, Session>();
  private sweeper?: NodeJS.Timeout;
  private lastAuthFailureLog = 0;
  private token: string;
  private scope: McpScope;
  private boundPort = 0;

  constructor(private options: McpHttpServerOptions) {
    this.audit = options.audit ?? new ActionLog();
    this.token = options.token;
    this.scope = options.scope;
  }

  get port(): number {
    return this.boundPort;
  }

  get url(): string {
    return `http://127.0.0.1:${this.boundPort}${MCP_PATH}`;
  }

  get running(): boolean {
    return Boolean(this.httpServer?.listening);
  }

  /**
   * New token and/or scope: open sessions end, clients must reconnect with the new credentials.
   * A scope change ends relay sessions too (their effective scope depends on the local scope);
   * a token change only affects local clients.
   */
  configure(update: { token?: string; scope?: McpScope }) {
    const scopeChanged = update.scope !== undefined && update.scope !== this.scope;
    if (update.token !== undefined) this.token = update.token;
    if (update.scope !== undefined) this.scope = update.scope;
    void this.closeSessions(scopeChanged ? undefined : 'local');
  }

  async start(): Promise<void> {
    if (this.httpServer) return;
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((error) => {
        if (!res.headersSent) this.json(res, 500, { error: 'internal_error', message: error instanceof Error ? error.message : String(error) });
        else res.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        reject(error.code === 'EADDRINUSE' ? new Error(`Port ${this.options.port} is already in use`) : error);
      });
      server.listen(this.options.port, '127.0.0.1', () => resolve());
    });
    this.httpServer = server;
    this.boundPort = (server.address() as AddressInfo).port;
    this.sweeper = setInterval(() => void this.sweep(), 60_000);
    this.sweeper.unref();
  }

  async stop(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    await this.closeSessions();
    const server = this.httpServer;
    this.httpServer = undefined;
    this.boundPort = 0;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  /** Close sessions (all, or only those of local clients) */
  async closeSessions(only?: 'local'): Promise<void> {
    const entries = [...this.sessions.entries()].filter(([, s]) => !only || s.principalId === 'local');
    for (const [id, s] of entries) {
      this.sessions.delete(id);
      await s.transport.close().catch(() => undefined);
    }
  }

  private async sweep() {
    const limit = Date.now() - SESSION_IDLE_MS;
    for (const [id, s] of [...this.sessions.entries()]) {
      if (s.lastSeen < limit) {
        this.sessions.delete(id);
        await s.transport.close().catch(() => undefined);
      }
    }
  }

  private json(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }

  private rpcError(res: http.ServerResponse, status: number, code: number, message: string) {
    this.json(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
  }

  private hostAllowed(req: http.IncomingMessage): boolean {
    const host = (req.headers.host ?? '').toLowerCase();
    const port = this.boundPort;
    return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
  }

  private authenticate(req: http.IncomingMessage): Principal | undefined {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return undefined;
    const presented = match[1].trim();
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
    if (this.options.relayKey && safeEqual(presented, this.options.relayKey)) {
      const id = String(req.headers[RELAY_HEADERS.token] ?? '').slice(0, 64) || 'unknown';
      const tokenScope: McpScope = String(req.headers[RELAY_HEADERS.scope]).toUpperCase() === 'READ_WRITE' ? 'write' : 'read';
      // the stricter of bot-token scope and local setting: a read-only app never writes, whatever the token says
      const scope: McpScope = tokenScope === 'write' && this.scope === 'write' ? 'write' : 'read';
      const relayUa = req.headers[RELAY_HEADERS.userAgent];
      return {
        id: `relay:${id}`,
        kind: 'relay',
        scope,
        tokenScope,
        cappedByLocal: tokenScope === 'write' && scope === 'read',
        userAgent: typeof relayUa === 'string' ? relayUa.slice(0, 200) : undefined,
      };
    }
    if (this.token && safeEqual(presented, this.token)) return { id: 'local', kind: 'local', scope: this.scope, userAgent: ua?.slice(0, 200) };
    return undefined;
  }

  private async readBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) throw Object.assign(new Error('Request body too large'), { status: 413 });
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      throw Object.assign(new Error('Invalid JSON'), { status: 400 });
    }
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== MCP_PATH) return this.json(res, 404, { error: 'not_found' });
    if (!this.hostAllowed(req)) return this.json(res, 403, { error: 'forbidden_host' });

    const principal = this.authenticate(req);
    if (!principal) {
      if (Date.now() - this.lastAuthFailureLog > 10_000) {
        this.lastAuthFailureLog = Date.now();
        this.audit.record({ principal: '-', action: 'auth', outcome: 'denied', message: 'missing or invalid bearer token' });
      }
      return this.json(res, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer realm="product-creator"' });
    }

    const method = req.method ?? 'GET';
    if (!['POST', 'GET', 'DELETE'].includes(method)) return this.json(res, 405, { error: 'method_not_allowed' }, { allow: 'GET, POST, DELETE' });

    let body: unknown;
    if (method === 'POST') {
      try {
        body = await this.readBody(req);
      } catch (error) {
        const status = (error as { status?: number }).status ?? 400;
        return this.rpcError(res, status, -32700, error instanceof Error ? error.message : 'Bad request');
      }
    }

    const sessionId = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : undefined;
    let session: Session | undefined;
    if (sessionId) {
      session = this.sessions.get(sessionId);
      // a session of another caller is indistinguishable from an unknown one
      if (!session || session.principalId !== principal.id) return this.rpcError(res, 404, -32001, 'Session not found');
    } else if (method !== 'POST' || !isInitializeRequest(body)) {
      return this.rpcError(res, 400, -32000, 'Bad request: send "initialize" first and pass Mcp-Session-Id afterwards');
    } else {
      if (this.sessions.size >= MAX_SESSIONS) return this.rpcError(res, 429, -32000, 'Too many MCP sessions');
      session = await this.createSession(principal);
    }

    session.lastSeen = Date.now();
    const authed = req as http.IncomingMessage & { auth?: { token: string; clientId: string; scopes: string[] } };
    authed.auth = { token: '', clientId: principal.id, scopes: [principal.scope] };
    await session.transport.handleRequest(authed, res, body);
  }

  private async createSession(principal: Principal): Promise<Session> {
    const server = new McpServer(
      { name: 'product-creator', version: this.options.version ?? '0.0.0' },
      {
        instructions:
          'Product Creator: feature catalog, services/libraries, code and schema sync, OpenAPI. Start with list_projects. Tools work only on projects open in the desktop app.' +
          (principal.cappedByLocal ? ' This app is set to read-only mode: write tools are disabled although your token allows writes.' : '')
      }
    );
    registerTools(server, { host: this.options.host, principal, audit: this.audit });
    const sessions = this.sessions;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessions.set(id, session);
      },
    });
    const session: Session = { transport, server, principalId: principal.id, lastSeen: Date.now() };
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await server.connect(transport);
    return session;
  }
}
