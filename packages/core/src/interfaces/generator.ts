import { execFile, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadOpenApiSpec } from './openapi';
import {
  assertInsideRoot,
  DEFAULT_GENERATE_TIMEOUT_SEC,
  type ComponentModel,
  type ProjectModel,
} from '../project/model';

/**
 * Runs the configured OpenAPI generation command of a component (PRODUCTCREATOR-23).
 *
 * Security: the command string is executed exactly as configured in the project's `*.pc.yml`
 * (like an npm script). Nothing else is interpolated into it; cwd must be inside the project root.
 * Opening an untrusted project and pressing "Generate" runs its command — the UI says so.
 */

export type GenerateState = 'idle' | 'running' | 'ok' | 'failed' | 'timeout' | 'cancelled';

export interface GenerateStatus {
  componentId: string;
  state: GenerateState;
  startedAt?: number;
  finishedAt?: number;
  exitCode?: number | null;
  signal?: string | null;
  message?: string;
  /** Operations found in the spec after a successful run */
  operations?: number;
  /** Tail of the output of the last run */
  log: string;
}

export interface SpecFileStatus {
  path: string;
  exists: boolean;
  /** Last modification time of the spec file (last generated / edited) */
  mtime?: number;
  operations?: number;
}

export interface ComponentGenerateInfo {
  componentId: string;
  /** A generate command is configured */
  canGenerate: boolean;
  specs: SpecFileStatus[];
  status: GenerateStatus;
}

export interface RunOptions {
  /** Called with every chunk of stdout/stderr */
  onLog?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  /** Extra environment (e.g. PATH of the login shell for a GUI-launched app) */
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

const MAX_LOG = 200_000;

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
    entries.push(
      env.PNPM_HOME ?? '',
      path.join(home, 'Library/pnpm'),
      path.join(home, '.local/share/pnpm'),
      path.join(home, '.volta/bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin'
    );
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

function killTree(pid: number | undefined, child: { kill: (s?: NodeJS.Signals) => boolean }) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']);
  } else {
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
}

function resolveCwd(project: ProjectModel, component: ComponentModel): string {
  const gen = component.openapiGenerate;
  if (!gen) throw new Error(`${component.name}: no OpenAPI generate command configured`);
  const rel = gen.cwd?.trim() || component.path;
  assertInsideRoot(rel, 'OpenAPI generate cwd');
  const cwd = path.resolve(project.root, rel);
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`Working directory not found: ${rel}`);
  return cwd;
}

export function specStatus(project: ProjectModel, component: ComponentModel): SpecFileStatus[] {
  return (component.openapi ?? []).map((rel) => {
    const abs = path.resolve(project.root, rel);
    try {
      const stat = fs.statSync(abs);
      const spec = loadOpenApiSpec(abs);
      return { path: rel, exists: true, mtime: stat.mtimeMs, operations: spec.error ? undefined : spec.operations.length };
    } catch {
      return { path: rel, exists: false };
    }
  });
}

/** Run the generate command once; resolves with the final status (never rejects for command failures) */
export async function runOpenApiGenerate(
  project: ProjectModel,
  component: ComponentModel,
  options: RunOptions = {}
): Promise<GenerateStatus> {
  const status: GenerateStatus = { componentId: component.id, state: 'running', startedAt: Date.now(), log: '' };
  const append = (chunk: string, stream: 'stdout' | 'stderr') => {
    status.log = (status.log + chunk).slice(-MAX_LOG);
    options.onLog?.(chunk, stream);
  };
  let cwd: string;
  try {
    cwd = resolveCwd(project, component);
  } catch (error) {
    return { ...status, state: 'failed', finishedAt: Date.now(), message: error instanceof Error ? error.message : String(error) };
  }
  const gen = component.openapiGenerate!;
  const timeoutMs = (gen.timeoutSec ?? DEFAULT_GENERATE_TIMEOUT_SEC) * 1000;
  append(`$ ${gen.command}\n(cwd: ${path.relative(project.root, cwd) || '.'})\n`, 'stdout');

  return new Promise<GenerateStatus>((resolve) => {
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    const child = spawn(gen.command, {
      cwd,
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: buildEnv(cwd, project.root, { ...process.env, ...options.env }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (patch: Partial<GenerateStatus>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve({ ...status, finishedAt: Date.now(), ...patch });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      append(`\n[timeout after ${timeoutMs / 1000}s — terminating]\n`, 'stderr');
      killTree(child.pid, child);
    }, timeoutMs);
    const onAbort = () => {
      cancelled = true;
      append('\n[cancelled — terminating]\n', 'stderr');
      killTree(child.pid, child);
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf-8').on('data', (c: string) => append(c, 'stdout'));
    child.stderr.setEncoding('utf-8').on('data', (c: string) => append(c, 'stderr'));
    child.on('error', (error) => finish({ state: 'failed', message: `Failed to start: ${error.message}` }));
    child.on('close', (code, signal) => {
      if (timedOut) return finish({ state: 'timeout', exitCode: code, signal, message: `Timed out after ${timeoutMs / 1000}s` });
      if (cancelled) return finish({ state: 'cancelled', exitCode: code, signal, message: 'Cancelled' });
      if (code !== 0) return finish({ state: 'failed', exitCode: code, signal, message: `Command exited with code ${code ?? signal}` });
      // exit 0: the declared spec files must exist and parse
      const specs = specStatus(project, component);
      const missing = specs.filter((s) => !s.exists).map((s) => s.path);
      if (missing.length) {
        return finish({ state: 'failed', exitCode: 0, message: `Command succeeded but the spec was not written: ${missing.join(', ')}` });
      }
      const broken = (component.openapi ?? []).map((rel) => loadOpenApiSpec(path.resolve(project.root, rel))).find((s) => s.error);
      if (broken) return finish({ state: 'failed', exitCode: 0, message: `Generated spec is not valid: ${broken.error}` });
      finish({ state: 'ok', exitCode: 0, operations: specs.reduce((n, s) => n + (s.operations ?? 0), 0) });
    });
  });
}

/**
 * Keeps the status of the last runs in memory (per component id), prevents parallel runs of the same
 * component and notifies listeners (log chunks, state changes).
 */
export class OpenApiGenerationManager {
  private statuses = new Map<string, GenerateStatus>();
  private controllers = new Map<string, AbortController>();
  private listeners = new Set<(event: GenerateEvent) => void>();

  constructor(private options: { env?: () => NodeJS.ProcessEnv | undefined } = {}) {}

  onEvent(listener: (event: GenerateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GenerateEvent) {
    this.listeners.forEach((l) => l(event));
  }

  status(componentId: string): GenerateStatus {
    return this.statuses.get(componentId) ?? { componentId, state: 'idle', log: '' };
  }

  info(project: ProjectModel): ComponentGenerateInfo[] {
    return project.components
      .filter((c) => c.openapiGenerate || (c.openapi && c.openapi.length))
      .map((c) => ({ componentId: c.id, canGenerate: Boolean(c.openapiGenerate), specs: specStatus(project, c), status: this.status(c.id) }));
  }

  cancel(componentId: string): boolean {
    const controller = this.controllers.get(componentId);
    controller?.abort();
    return Boolean(controller);
  }

  /** Abort every running generate (app quit): killTree in runOpenApiGenerate sends SIGTERM. */
  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
  }

  async generate(project: ProjectModel, component: ComponentModel): Promise<GenerateStatus> {
    if (this.controllers.has(component.id)) throw new Error(`${component.name}: generation is already running`);
    const controller = new AbortController();
    this.controllers.set(component.id, controller);
    const running: GenerateStatus = { componentId: component.id, state: 'running', startedAt: Date.now(), log: '' };
    this.statuses.set(component.id, running);
    this.emit({ type: 'status', status: running });
    try {
      const result = await runOpenApiGenerate(project, component, {
        env: this.options.env?.(),
        signal: controller.signal,
        onLog: (chunk, stream) => {
          running.log = (running.log + chunk).slice(-MAX_LOG);
          this.emit({ type: 'log', componentId: component.id, chunk, stream });
        },
      });
      this.statuses.set(component.id, result);
      this.emit({ type: 'status', status: result });
      return result;
    } finally {
      this.controllers.delete(component.id);
    }
  }

  /** Run all components with a generate command, one after another; failures do not stop the rest */
  async generateAll(project: ProjectModel): Promise<GenerateStatus[]> {
    const results: GenerateStatus[] = [];
    for (const component of project.components.filter((c) => c.openapiGenerate)) {
      try {
        results.push(await this.generate(project, component));
      } catch (error) {
        results.push({
          componentId: component.id,
          state: 'failed',
          message: error instanceof Error ? error.message : String(error),
          log: '',
        });
      }
    }
    return results;
  }
}

export type GenerateEvent =
  | { type: 'status'; status: GenerateStatus }
  | { type: 'log'; componentId: string; chunk: string; stream: 'stdout' | 'stderr' };
