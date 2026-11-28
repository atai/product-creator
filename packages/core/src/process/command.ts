import { execFile, spawn, spawnSync, type ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';

/**
 * Running the commands a project configures (OpenAPI generation PRODUCTCREATOR-23, screenshots PRODUCTCREATOR-36).
 *
 * Security: a command string is executed exactly as configured in the project's YAML (like an npm script).
 * Nothing else is interpolated into it; callers check that cwd is inside the project root.
 */

export type CommandState = 'ok' | 'failed' | 'timeout' | 'cancelled';

export interface CommandResult {
  state: CommandState;
  exitCode?: number | null;
  signal?: string | null;
  message?: string;
  /** Tail of stdout + stderr */
  log: string;
}

export interface CommandOptions {
  command: string;
  /** Absolute working directory */
  cwd: string;
  /** Project root: node_modules/.bin between cwd and root are added to PATH */
  projectRoot: string;
  timeoutMs: number;
  /** Extra environment */
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onLog?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export const MAX_LOG = 200_000;

/** Environment added to every command, e.g. the PATH of the user's login shell for a GUI-launched app */
let defaultEnv: NodeJS.ProcessEnv | undefined;
export function setCommandEnv(env: NodeJS.ProcessEnv | undefined) {
  defaultEnv = env;
}

/** PATH entries usually missing in GUI-launched apps (Finder/Dock) */
export function extraPathEntries(cwd: string, projectRoot: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const home = os.homedir();
  const entries: string[] = [];
  // node_modules/.bin of the cwd and its parents up to the project root
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    entries.push(path.join(dir, 'node_modules', '.bin'));
    if (dir === projectRoot || dir === path.dirname(dir)) break;
  }
  if (process.platform !== 'win32') {
    entries.push(env.PNPM_HOME ?? '', path.join(home, 'Library/pnpm'), path.join(home, '.local/share/pnpm'), path.join(home, '.volta/bin'), '/opt/homebrew/bin', '/usr/local/bin');
  }
  return entries.filter(Boolean);
}

export function buildEnv(cwd: string, projectRoot: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const pathKey = Object.keys(base).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  const current = (base[pathKey] ?? '').split(path.delimiter).filter(Boolean);
  const merged = [...extraPathEntries(cwd, projectRoot, base), ...current].filter((p, i, a) => a.indexOf(p) === i);
  // non-interactive: no colours/prompts from tools
  return { ...base, [pathKey]: merged.join(path.delimiter), CI: base.CI ?? '1', FORCE_COLOR: '0', NO_COLOR: '1' };
}

/** PATH of the user's login shell (best effort, POSIX only) — used by the desktop app on start */
export function loginShellPath(): Promise<string | undefined> {
  if (process.platform === 'win32') return Promise.resolve(undefined);
  const shell = process.env.SHELL || '/bin/zsh';
  return new Promise((resolve) => {
    execFile(shell, ['-l', '-c', 'printf %s "$PATH"'], { encoding: 'utf-8', timeout: 4000 }, (error, stdout) => {
      resolve(!error && stdout.trim() ? stdout.trim() : undefined);
    });
  });
}

/** Terminates a command and everything it started (process group on POSIX) */
export function killTree(child: ChildProcess) {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']);
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  // escalate if it does not exit
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }, 3000).unref();
}

function spawnCommand(options: CommandOptions): ChildProcess {
  return spawn(options.command, {
    cwd: options.cwd,
    shell: true,
    detached: process.platform !== 'win32',
    windowsHide: true,
    env: buildEnv(options.cwd, options.projectRoot, { ...process.env, ...defaultEnv, ...options.env }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Run a command to completion; resolves with the result (never rejects for command failures) */
export function runCommand(options: CommandOptions): Promise<CommandResult> {
  let log = '';
  const append = (chunk: string, stream: 'stdout' | 'stderr') => {
    log = (log + chunk).slice(-MAX_LOG);
    options.onLog?.(chunk, stream);
  };
  append(`$ ${options.command}\n(cwd: ${path.relative(options.projectRoot, options.cwd) || '.'})\n`, 'stdout');
  return new Promise<CommandResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    const child = spawnCommand(options);
    const finish = (result: Omit<CommandResult, 'log'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({ ...result, log });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      append(`\n[timeout after ${options.timeoutMs / 1000}s — terminating]\n`, 'stderr');
      killTree(child);
    }, options.timeoutMs);
    const onAbort = () => {
      cancelled = true;
      append('\n[cancelled — terminating]\n', 'stderr');
      killTree(child);
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.setEncoding('utf-8').on('data', (c: string) => append(c, 'stdout'));
    child.stderr?.setEncoding('utf-8').on('data', (c: string) => append(c, 'stderr'));
    child.on('error', (error) => finish({ state: 'failed', message: `Failed to start: ${error.message}` }));
    child.on('close', (code, signal) => {
      if (timedOut) return finish({ state: 'timeout', exitCode: code, signal, message: `Timed out after ${options.timeoutMs / 1000}s` });
      if (cancelled) return finish({ state: 'cancelled', exitCode: code, signal, message: 'Cancelled' });
      if (code !== 0) return finish({ state: 'failed', exitCode: code, signal, message: `Command exited with code ${code ?? signal}` });
      finish({ state: 'ok', exitCode: 0 });
    });
  });
}

export interface BackgroundProcess {
  /** Resolves when the process exits (by itself or after stop) */
  exited: Promise<{ code: number | null; signal: string | null }>;
  /** True while the process runs */
  running(): boolean;
  /** Terminates the process tree and waits for it to exit */
  stop(): Promise<void>;
}

/** Start a long-running command (a dev server, docker compose up …); its output goes to onLog */
export function startBackground(options: Omit<CommandOptions, 'timeoutMs' | 'signal'>): BackgroundProcess {
  options.onLog?.(`$ ${options.command} &\n(cwd: ${path.relative(options.projectRoot, options.cwd) || '.'})\n`, 'stdout');
  const child = spawnCommand({ ...options, timeoutMs: 0 });
  let alive = true;
  child.stdout?.setEncoding('utf-8').on('data', (c: string) => options.onLog?.(c, 'stdout'));
  child.stderr?.setEncoding('utf-8').on('data', (c: string) => options.onLog?.(c, 'stderr'));
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.on('error', (error) => {
      options.onLog?.(`Failed to start: ${error.message}\n`, 'stderr');
      alive = false;
      resolve({ code: null, signal: null });
    });
    child.on('close', (code, signal) => {
      alive = false;
      resolve({ code, signal });
    });
  });
  return {
    exited,
    running: () => alive,
    stop: async () => {
      if (!alive) return;
      killTree(child);
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000).unref())]);
    },
  };
}
