import * as http from 'http';
import { WebSocket, type RawData } from 'ws';
import type { McpScope } from '../host.js';
import { MCP_PATH, RELAY_HEADERS } from '../server.js';
import { CloseCode, decodeFrame, encodeFrame, FrameDecodeError, FrameFlag, FrameType, hasFlag, isKnownFrameType, WS_SUBPROTOCOL, type Frame, type ResetCode } from './frames.js';

export const DEFAULT_RELAY_URL = 'wss://relay.emperor.ecooz.net/tunnel';

export type RelayState =
  /** not started */
  | 'off'
  | 'connecting'
  | 'online'
  /** waiting before the next attempt */
  | 'reconnecting'
  /** the relay rejected the key (401) */
  | 'invalid_key'
  /** the key was revoked or rotated (4004 / GOAWAY revoked): enter a new key */
  | 'revoked'
  /** another PC instance connected with the same key (4003) */
  | 'replaced';

export interface RelayStatus {
  state: RelayState;
  /** Public MCP URL for bots (from WELCOME) */
  publicUrl?: string;
  deviceId?: string;
  /** Last problem, never contains the key */
  error?: string;
  connectedAt?: string;
  activeStreams: number;
  /** Requests served in this session of the app */
  requests: number;
}

export interface RelayClientOptions {
  /** `wss://relay.emperor.ecooz.net/tunnel` */
  url: string;
  /** `rld_<deviceId>.<secret>` */
  deviceKey: string;
  /** In-process secret the local MCP server accepts for relayed requests */
  relayKey: string;
  /** URL of the local MCP server, undefined while it is not running */
  localUrl: () => string | undefined;
  /** `product-creator/<version>` */
  clientName: string;
  /** Local MCP scope setting right now; reported to the relay (read_only = writes are impossible) */
  mcpScope: () => McpScope;
  onStatus?: (status: RelayStatus) => void;
  /** Called for each relayed request (for logs) — never receives secrets */
  log?: (message: string) => void;
  /** Timing knobs (tests) */
  timing?: { pingMs?: number; pongTimeoutMs?: number; backoffMinMs?: number; backoffMaxMs?: number; helloTimeoutMs?: number; random?: () => number };
}

interface Limits {
  maxFrameBody: number;
  maxRequestBody: number;
  maxResponseBody: number;
  maxStreams: number;
  initialWindow: number;
}

interface Stream {
  id: number;
  token: { id: string; scope: string };
  userAgent?: string;
  headers: Record<string, string>;
  method: string;
  chunks: Buffer[];
  received: number;
  req?: http.ClientRequest;
  res?: http.IncomingMessage;
  /** bytes we may still send to the relay on this stream */
  credit: number;
  sent: number;
  pending: Buffer[];
  responseEnded: boolean;
  headersSent: boolean;
  sse: boolean;
  keepAlive?: NodeJS.Timeout;
  deadline?: NodeJS.Timeout;
  dead: boolean;
}

const FORWARD_HEADERS = ['content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id'];
const RESPONSE_HEADERS = ['content-type', 'mcp-session-id', 'cache-control'];
const DEFAULT_LIMITS: Limits = { maxFrameBody: 64 * 1024, maxRequestBody: 4 * 1024 * 1024, maxResponseBody: 16 * 1024 * 1024, maxStreams: 32, initialWindow: 256 * 1024 };
const MAX_STREAMS = 16;
const SSE_KEEPALIVE_MS = 30_000;

const clean = (value: unknown): string | undefined => (typeof value === 'string' ? value.replace(/[\r\n\0]/g, ' ').slice(0, 2000) : undefined);

/**
 * Client of the Emperor MCP relay (pc-relay.v1, PRODUCTCREATOR-20): keeps one outbound WebSocket and turns
 * every relayed bot request into a request to the *local* MCP server. Safety rules of the protocol that
 * live here: only the local MCP URL is ever called, the local bearer is substituted by the in-process
 * relay key (the bot token never reaches the local server), the scope of the bot token is passed on and
 * enforced by the local server, only allow-listed headers are forwarded.
 */
export class RelayClient {
  private ws?: WebSocket;
  private limits = DEFAULT_LIMITS;
  private streams = new Map<number, Stream>();
  private attempt = 0;
  private retryTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private pongTimer?: NodeJS.Timeout;
  private helloTimer?: NodeJS.Timeout;
  private stopped = true;
  private requests = 0;
  /** Last mode the relay was told (HELLO or CAPABILITIES) */
  private reportedMode?: string;
  private current: RelayStatus = { state: 'off', activeStreams: 0, requests: 0 };

  constructor(private options: RelayClientOptions) {}

  status(): RelayStatus {
    return { ...this.current, activeStreams: this.streams.size, requests: this.requests };
  }

  private set(patch: Partial<RelayStatus>) {
    this.current = { ...this.current, ...patch };
    this.options.onStatus?.(this.status());
  }

  private log(message: string) {
    this.options.log?.(message);
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.teardown(1000, 'client stopped');
    this.set({ state: 'off', publicUrl: undefined, deviceId: undefined, error: undefined, connectedAt: undefined });
  }

  private teardown(code?: number, reason?: string) {
    clearInterval(this.pingTimer);
    clearTimeout(this.pongTimer);
    clearTimeout(this.helloTimer);
    for (const s of [...this.streams.values()]) this.killStream(s);
    const ws = this.ws;
    this.ws = undefined;
    if (ws) {
      ws.removeAllListeners('message');
      ws.removeAllListeners('close');
      ws.on('error', () => undefined);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          if (code) ws.close(code, reason);
          else ws.terminate();
        }
      } catch {
        ws.terminate();
      }
    }
  }

  private scheduleReconnect(minDelayMs = 0) {
    if (this.stopped) return;
    const t = this.options.timing ?? {};
    const min = t.backoffMinMs ?? 1000;
    const max = t.backoffMaxMs ?? 60_000;
    const base = Math.min(max, min * 2 ** this.attempt);
    this.attempt++;
    const jitter = (t.random ?? Math.random)();
    const delay = Math.max(minDelayMs, Math.round(base / 2 + (base / 2) * jitter));
    this.set({ state: 'reconnecting' });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
    this.log(`relay: reconnecting in ${delay} ms`);
  }

  private connect() {
    if (this.stopped) return;
    this.teardown();
    this.set({ state: 'connecting', error: undefined });
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.options.url, WS_SUBPROTOCOL, {
        headers: { authorization: `Bearer ${this.options.deviceKey}` },
        handshakeTimeout: 15_000,
        maxPayload: 1024 * 1024,
        perMessageDeflate: false,
      });
    } catch (error) {
      this.set({ state: 'reconnecting', error: error instanceof Error ? error.message : String(error) });
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.on('open', () => {
      const capabilities = this.capabilities();
      this.reportedMode = capabilities.mcpScope;
      this.send(FrameType.HELLO, 0, 0, { protocol: [1], client: this.options.clientName, maxConcurrentStreams: MAX_STREAMS, capabilities });
      this.helloTimer = setTimeout(() => this.fail('no WELCOME from the relay'), this.options.timing?.helloTimeoutMs ?? 10_000);
    });
    ws.on('unexpected-response', (_req, res) => {
      res.resume();
      const status = res.statusCode ?? 0;
      if (this.ws !== ws) return;
      this.ws = undefined;
      ws.removeAllListeners();
      ws.on('error', () => undefined);
      if (status === 401) {
        this.set({ state: 'invalid_key', error: 'The relay rejected the device key (401). Check the key in Emperor → Profile → Remote access.' });
      } else {
        this.set({ state: 'reconnecting', error: `The relay answered HTTP ${status}${status === 503 ? ' (restarting)' : ''}` });
        this.scheduleReconnect();
      }
    });
    ws.on('error', (error) => {
      // 'close' follows; remember the reason for the status line
      this.set({ error: error.message });
    });
    ws.on('message', (data: RawData, isBinary: boolean) => this.onMessage(ws, data, isBinary));
    ws.on('close', (code) => this.onClose(ws, code));
  }

  /** Capabilities reported to the relay: whether this app can write at all */
  private capabilities(): { mcpScope: 'read_only' | 'read_write' } {
    return { mcpScope: this.options.mcpScope() === 'write' ? 'read_write' : 'read_only' };
  }

  /**
   * The local scope setting may have changed: tell the relay while connected (a CAPABILITIES frame with
   * the IGNORABLE flag, so a relay without support for it skips it). A new connection reports it in HELLO.
   */
  refreshCapabilities() {
    if (this.current.state !== 'online') return;
    const capabilities = this.capabilities();
    if (capabilities.mcpScope === this.reportedMode) return;
    this.reportedMode = capabilities.mcpScope;
    this.send(FrameType.CAPABILITIES, 0, FrameFlag.IGNORABLE, capabilities);
    this.log(`relay: reported local mode ${capabilities.mcpScope}`);
  }

  private fail(message: string) {
    this.set({ error: message });
    this.log(`relay: ${message}`);
    this.teardown(CloseCode.PROTOCOL_ERROR, message.slice(0, 100));
    this.scheduleReconnect();
  }

  private onClose(ws: WebSocket, code: number) {
    if (this.ws !== ws) return;
    clearInterval(this.pingTimer);
    clearTimeout(this.pongTimer);
    clearTimeout(this.helloTimer);
    for (const s of [...this.streams.values()]) this.killStream(s);
    this.ws = undefined;
    this.set({ connectedAt: undefined, publicUrl: undefined });
    if (this.stopped) return;
    if (code === CloseCode.REVOKED) {
      this.stopped = true;
      this.set({ state: 'revoked', error: 'The device key was revoked or rotated in Emperor. Enter the new key.' });
    } else if (code === CloseCode.REPLACED) {
      this.stopped = true;
      this.set({ state: 'replaced', error: 'Another Product Creator instance connected with the same device key.' });
    } else {
      this.scheduleReconnect();
    }
  }

  // ───────── sending ─────────

  private send(type: number, streamId: number, flags: number, header?: Record<string, unknown> | null, body?: Uint8Array) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(encodeFrame({ type, streamId, flags, header, body }));
  }

  private reset(streamId: number, code: ResetCode, message?: string) {
    this.send(FrameType.RST_STREAM, streamId, 0, { code, message });
  }

  // ───────── receiving ─────────

  private onMessage(ws: WebSocket, data: RawData, isBinary: boolean) {
    if (this.ws !== ws) return;
    if (!isBinary) return this.fail('text frame from the relay');
    let frame: Frame;
    try {
      const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
      frame = decodeFrame(buffer);
    } catch (error) {
      return this.fail(error instanceof FrameDecodeError ? error.message : 'bad frame');
    }
    switch (frame.type) {
      case FrameType.WELCOME:
        return this.onWelcome(frame);
      case FrameType.REQ_HEADERS:
        return this.onRequestHeaders(frame);
      case FrameType.REQ_BODY:
        return this.onRequestBody(frame);
      case FrameType.WINDOW_UPDATE: {
        const s = this.streams.get(frame.streamId);
        const credit = Number(frame.header?.credit);
        if (s && Number.isFinite(credit) && credit > 0) {
          s.credit += credit;
          this.pump(s);
        }
        return;
      }
      case FrameType.RST_STREAM: {
        const s = this.streams.get(frame.streamId);
        if (s) this.killStream(s);
        return;
      }
      case FrameType.PING:
        return this.send(FrameType.PONG, 0, 0, frame.header);
      case FrameType.PONG:
        clearTimeout(this.pongTimer);
        return;
      case FrameType.GOAWAY: {
        const reason = String(frame.header?.reason ?? '');
        const after = Number(frame.header?.reconnectAfterMs);
        this.log(`relay: GOAWAY ${reason}`);
        if (reason === 'revoked') {
          this.stopped = true;
          this.set({ state: 'revoked', error: 'The device key was revoked or rotated in Emperor. Enter the new key.' });
          this.teardown(1000, 'revoked');
        } else {
          this.teardown(1000, 'goaway');
          this.scheduleReconnect(Number.isFinite(after) && after > 0 ? Math.min(after, 5 * 60_000) : 0);
        }
        return;
      }
      case FrameType.EVENT:
        return;
      case FrameType.ERROR:
        return this.fail(`relay error: ${clean(frame.header?.code) ?? ''} ${clean(frame.header?.message) ?? ''}`.trim());
      default:
        if (!isKnownFrameType(frame.type) && !hasFlag(frame, FrameFlag.IGNORABLE)) this.fail(`unknown frame type ${frame.type}`);
    }
  }

  private onWelcome(frame: Frame) {
    clearTimeout(this.helloTimer);
    const h = frame.header ?? {};
    const l = (h.limits ?? {}) as Partial<Limits>;
    this.limits = {
      maxFrameBody: Math.min(l.maxFrameBody ?? DEFAULT_LIMITS.maxFrameBody, DEFAULT_LIMITS.maxFrameBody),
      maxRequestBody: l.maxRequestBody ?? DEFAULT_LIMITS.maxRequestBody,
      maxResponseBody: l.maxResponseBody ?? DEFAULT_LIMITS.maxResponseBody,
      maxStreams: l.maxStreams ?? DEFAULT_LIMITS.maxStreams,
      initialWindow: l.initialWindow ?? DEFAULT_LIMITS.initialWindow,
    };
    this.attempt = 0;
    this.set({ state: 'online', error: undefined, publicUrl: clean(h.publicUrl), deviceId: clean(h.deviceId), connectedAt: new Date().toISOString() });
    this.log('relay: online');
    this.refreshCapabilities(); // the setting may have changed since HELLO
    const t = this.options.timing ?? {};
    this.pingTimer = setInterval(() => {
      this.send(FrameType.PING, 0, 0, { t: Date.now() });
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => this.fail('relay did not answer PING'), t.pongTimeoutMs ?? 10_000);
    }, t.pingMs ?? 30_000);
  }

  private onRequestHeaders(frame: Frame) {
    const h = frame.header ?? {};
    const id = frame.streamId;
    if (id === 0 || this.streams.has(id)) return this.reset(id, 'PROTOCOL', 'bad stream id');
    if (this.streams.size >= Math.min(MAX_STREAMS, this.limits.maxStreams)) return this.reset(id, 'REFUSED', 'too many streams');
    const headers: Record<string, string> = {};
    const incoming = (h.headers ?? {}) as Record<string, unknown>;
    for (const name of FORWARD_HEADERS) {
      const value = clean(incoming[name]);
      if (value) headers[name] = value;
    }
    const token = (h.token ?? {}) as { id?: unknown; scope?: unknown };
    const client = (h.client ?? {}) as { ua?: unknown };
    const stream: Stream = {
      id,
      method: String(h.method ?? 'POST').toUpperCase(),
      headers,
      token: { id: clean(token.id) ?? 'unknown', scope: token.scope === 'READ_WRITE' ? 'READ_WRITE' : 'READ' },
      userAgent: clean(client.ua),
      chunks: [],
      received: 0,
      credit: this.limits.initialWindow,
      sent: 0,
      pending: [],
      responseEnded: false,
      headersSent: false,
      sse: false,
      dead: false,
    };
    this.streams.set(id, stream);
    this.requests++;
    const deadlineMs = Number(h.deadlineMs);
    if (Number.isFinite(deadlineMs) && deadlineMs > 0) stream.deadline = setTimeout(() => this.abortStream(stream, 'TIMEOUT'), Math.min(deadlineMs, 3_600_000));
    const path = String(h.path ?? '');
    if (path !== MCP_PATH) {
      return this.respondError(stream, 404, 'not_found', 'Only /mcp is served');
    }
    if (!['GET', 'POST', 'DELETE'].includes(stream.method)) {
      return this.respondError(stream, 405, 'method_not_allowed', 'Method not allowed');
    }
    if (hasFlag(frame, FrameFlag.END_STREAM)) this.dispatchLocal(stream);
  }

  private onRequestBody(frame: Frame) {
    const s = this.streams.get(frame.streamId);
    if (!s || s.dead || s.req) return;
    s.received += frame.body.length;
    if (s.received > this.limits.maxRequestBody) return this.abortStream(s, 'TOO_LARGE');
    s.chunks.push(Buffer.from(frame.body));
    if (frame.body.length) this.send(FrameType.WINDOW_UPDATE, s.id, 0, { credit: frame.body.length });
    if (hasFlag(frame, FrameFlag.END_STREAM)) this.dispatchLocal(s);
  }

  // ───────── forwarding to the local MCP server ─────────

  private respondError(stream: Stream, status: number, code: string, message: string) {
    if (stream.dead || stream.headersSent) return;
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message, data: { code } }, id: null }));
    stream.headersSent = true;
    this.send(FrameType.RES_HEADERS, stream.id, 0, { status, headers: { 'content-type': 'application/json' } });
    stream.pending.push(body);
    stream.responseEnded = true;
    this.pump(stream);
  }

  private dispatchLocal(stream: Stream) {
    if (stream.dead || stream.headersSent || stream.req) return;
    const local = this.options.localUrl();
    if (!local) return this.respondError(stream, 503, 'local_mcp_disabled', 'The MCP server of Product Creator is switched off');
    const url = new URL(local); // always the own local server; the relay cannot choose the target
    const body = Buffer.concat(stream.chunks);
    const headers: Record<string, string> = {
      ...stream.headers,
      authorization: `Bearer ${this.options.relayKey}`,
      [RELAY_HEADERS.token]: stream.token.id,
      [RELAY_HEADERS.scope]: stream.token.scope,
    };
    if (stream.userAgent) headers[RELAY_HEADERS.userAgent] = stream.userAgent;
    if (body.length) headers['content-length'] = String(body.length);
    const req = http.request({ host: url.hostname, port: Number(url.port), path: MCP_PATH, method: stream.method, headers, agent: false }, (res) => this.onLocalResponse(stream, res));
    stream.req = req;
    req.on('error', (error) => {
      if (stream.dead) return;
      if (!stream.headersSent) this.respondError(stream, 502, 'local_unreachable', `Local MCP server error: ${error.message}`);
      else this.abortStream(stream, 'INTERNAL');
    });
    req.end(body.length ? body : undefined);
  }

  private onLocalResponse(stream: Stream, res: http.IncomingMessage) {
    if (stream.dead) return res.destroy();
    stream.res = res;
    const type = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const status = res.statusCode ?? 502;
    const empty = res.headers['content-length'] === '0' || status === 202 || status === 204;
    if (!empty && type !== 'application/json' && type !== 'text/event-stream') {
      return this.abortStream(stream, 'INTERNAL', 'unexpected content type');
    }
    stream.sse = type === 'text/event-stream';
    const out: Record<string, string> = {};
    for (const name of RESPONSE_HEADERS) {
      const v = res.headers[name];
      if (typeof v === 'string') out[name] = v;
    }
    stream.headersSent = true;
    if (empty) {
      this.send(FrameType.RES_HEADERS, stream.id, FrameFlag.END_STREAM, { status, headers: out });
      res.resume();
      return this.finishStream(stream);
    }
    this.send(FrameType.RES_HEADERS, stream.id, 0, { status, headers: out });
    if (stream.sse) {
      stream.keepAlive = setInterval(() => {
        stream.pending.push(Buffer.from(': ping\n\n'));
        this.pump(stream);
      }, SSE_KEEPALIVE_MS);
    }
    let total = 0;
    res.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (!stream.sse && total > this.limits.maxResponseBody) return this.abortStream(stream, 'TOO_LARGE');
      stream.pending.push(chunk);
      this.pump(stream);
    });
    res.on('end', () => {
      stream.responseEnded = true;
      this.pump(stream);
    });
    res.on('error', () => this.abortStream(stream, 'INTERNAL'));
  }

  /** Send queued response bytes within the stream window (flow control) */
  private pump(stream: Stream) {
    if (stream.dead) return;
    while (stream.pending.length && stream.credit > 0) {
      let chunk = stream.pending[0];
      const size = Math.min(chunk.length, stream.credit, this.limits.maxFrameBody);
      if (size < chunk.length) {
        stream.pending[0] = chunk.subarray(size);
        chunk = chunk.subarray(0, size);
      } else {
        stream.pending.shift();
      }
      stream.credit -= size;
      this.send(FrameType.RES_BODY, stream.id, 0, null, chunk);
    }
    const queued = stream.pending.reduce((n, c) => n + c.length, 0);
    stream.res?.[queued > this.limits.initialWindow ? 'pause' : 'resume']();
    if (stream.responseEnded && stream.pending.length === 0) {
      this.send(FrameType.RES_BODY, stream.id, FrameFlag.END_STREAM);
      this.finishStream(stream);
    }
  }

  private finishStream(stream: Stream) {
    this.cleanup(stream);
    this.streams.delete(stream.id);
  }

  private cleanup(stream: Stream) {
    stream.dead = true;
    clearInterval(stream.keepAlive);
    clearTimeout(stream.deadline);
  }

  /** The relay reset the stream or the tunnel went down: stop the local request, send nothing */
  private killStream(stream: Stream) {
    this.cleanup(stream);
    this.streams.delete(stream.id);
    stream.req?.destroy();
    stream.res?.destroy();
  }

  /** We give up on a stream: tell the relay */
  private abortStream(stream: Stream, code: ResetCode, message?: string) {
    if (!stream.dead) this.reset(stream.id, code, message);
    this.killStream(stream);
  }
}
