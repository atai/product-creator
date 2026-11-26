/**
 * pc-relay.v1 frame codec (PC side of the Emperor MCP relay).
 * Contract: emperor-web-ui docs/source/developer-guide/implementation/mcp-relay-protocol.rst
 *
 * One WebSocket binary message = one frame:
 *   u8 version(=1) | u8 type | u32 streamId | u8 flags | u32 headerLen | header (JSON) | body
 * Integers are big-endian.
 */

export const PROTOCOL_VERSION = 1;
export const WS_SUBPROTOCOL = 'pc-relay.v1';
export const FRAME_PREFIX_BYTES = 11;

export const FrameType = {
  HELLO: 0x01,
  WELCOME: 0x02,
  REQ_HEADERS: 0x10,
  REQ_BODY: 0x11,
  RES_HEADERS: 0x20,
  RES_BODY: 0x21,
  WINDOW_UPDATE: 0x30,
  RST_STREAM: 0x31,
  PING: 0x40,
  PONG: 0x41,
  /** PC→R, extension: local capabilities changed (sent with IGNORABLE; relays that do not know it skip it) */
  CAPABILITIES: 0x42,
  GOAWAY: 0x50,
  EVENT: 0x60,
  ERROR: 0x7f,
} as const;

export const FrameFlag = { END_STREAM: 0x01, IGNORABLE: 0x02 } as const;

export type ResetCode = 'CANCELLED' | 'TIMEOUT' | 'TOO_LARGE' | 'REFUSED' | 'PROTOCOL' | 'INTERNAL';

/** WebSocket close codes of the relay */
export const CloseCode = { GOING_AWAY: 1001, PROTOCOL_ERROR: 4002, REPLACED: 4003, REVOKED: 4004, HEARTBEAT_TIMEOUT: 4008 } as const;

export interface Frame {
  type: number;
  streamId: number;
  flags: number;
  header: Record<string, unknown> | null;
  body: Buffer;
}

export class FrameDecodeError extends Error {}

const KNOWN = new Set<number>(Object.values(FrameType));
export const isKnownFrameType = (type: number): boolean => KNOWN.has(type);

export function encodeFrame(frame: { type: number; streamId?: number; flags?: number; header?: Record<string, unknown> | null; body?: Uint8Array | null }): Buffer {
  const header = frame.header ? Buffer.from(JSON.stringify(frame.header), 'utf8') : Buffer.alloc(0);
  const body = frame.body ? Buffer.from(frame.body) : Buffer.alloc(0);
  const prefix = Buffer.alloc(FRAME_PREFIX_BYTES);
  prefix.writeUInt8(PROTOCOL_VERSION, 0);
  prefix.writeUInt8(frame.type, 1);
  prefix.writeUInt32BE(frame.streamId ?? 0, 2);
  prefix.writeUInt8(frame.flags ?? 0, 6);
  prefix.writeUInt32BE(header.length, 7);
  return Buffer.concat([prefix, header, body]);
}

export function decodeFrame(data: Buffer): Frame {
  if (data.length < FRAME_PREFIX_BYTES) throw new FrameDecodeError('frame shorter than its prefix');
  const version = data.readUInt8(0);
  if (version !== PROTOCOL_VERSION) throw new FrameDecodeError(`unsupported frame version ${version}`);
  const headerLen = data.readUInt32BE(7);
  const headerEnd = FRAME_PREFIX_BYTES + headerLen;
  if (headerEnd > data.length) throw new FrameDecodeError('header length exceeds the frame');
  let header: Record<string, unknown> | null = null;
  if (headerLen > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.subarray(FRAME_PREFIX_BYTES, headerEnd).toString('utf8'));
    } catch {
      throw new FrameDecodeError('header is not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new FrameDecodeError('header must be a JSON object');
    header = parsed as Record<string, unknown>;
  }
  return { type: data.readUInt8(1), streamId: data.readUInt32BE(2), flags: data.readUInt8(6), header, body: data.subarray(headerEnd) };
}

export const hasFlag = (frame: { flags: number }, flag: number): boolean => (frame.flags & flag) === flag;
