import * as fs from 'fs';
import * as path from 'path';

export interface ActionLogEntry {
  /** ISO timestamp */
  ts: string;
  /** `local`, `relay:<botTokenId>` or `-` for unauthenticated requests */
  principal: string;
  scope?: 'read' | 'write';
  userAgent?: string;
  /** tool name, or `auth` for rejected requests */
  action: string;
  /** read-only tools never change data */
  write?: boolean;
  outcome: 'ok' | 'error' | 'denied';
  durationMs?: number;
  /** compact, truncated arguments (never the token) */
  args?: Record<string, unknown>;
  message?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const RECENT = 200;

/** Append-only JSONL action log of agent calls (+ recent entries in memory for the settings screen) */
export class ActionLog {
  private recentEntries: ActionLogEntry[] = [];
  private listeners = new Set<(entry: ActionLogEntry) => void>();

  /** `file` undefined: memory only */
  constructor(private file?: string) {}

  record(entry: Omit<ActionLogEntry, 'ts'>): ActionLogEntry {
    const full: ActionLogEntry = { ts: new Date().toISOString(), ...entry };
    this.recentEntries.push(full);
    if (this.recentEntries.length > RECENT) this.recentEntries.shift();
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        if (fs.existsSync(this.file) && fs.statSync(this.file).size > MAX_BYTES) fs.renameSync(this.file, `${this.file}.1`);
        fs.appendFileSync(this.file, JSON.stringify(full) + '\n', { mode: 0o600 });
      } catch {
        /* a broken log file must not break tool calls */
      }
    }
    for (const l of this.listeners) l(full);
    return full;
  }

  recent(limit = 50): ActionLogEntry[] {
    return this.recentEntries.slice(-limit).reverse();
  }

  onEntry(listener: (entry: ActionLogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Shorten long argument values so that cards and tokens do not end up in the log */
export function compactArgs(args: unknown): Record<string, unknown> | undefined {
  if (!args || typeof args !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value.length > 120 ? value.slice(0, 120) + '…' : value;
    else if (typeof value === 'number' || typeof value === 'boolean' || value == null) out[key] = value;
    else out[key] = Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value as object).slice(0, 8).join(',')}}`;
  }
  return out;
}
