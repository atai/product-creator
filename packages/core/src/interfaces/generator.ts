import * as fs from 'fs';
import * as path from 'path';
import { MAX_LOG, runCommand } from '../process/command';
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

// moved to process/command.ts (PRODUCTCREATOR-36); re-exported for existing callers
export { buildEnv, extraPathEntries, loginShellPath } from '../process/command';

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
  const run = await runCommand({ command: gen.command, cwd, projectRoot: project.root, timeoutMs, env: options.env, signal: options.signal, onLog: append });
  const done = (patch: Partial<GenerateStatus>) => ({ ...status, finishedAt: Date.now(), exitCode: run.exitCode, signal: run.signal, ...patch });
  if (run.state !== 'ok') return done({ state: run.state, message: run.message });
  // exit 0: the declared spec files must exist and parse
  const specs = specStatus(project, component);
  const missing = specs.filter((s) => !s.exists).map((s) => s.path);
  if (missing.length) return done({ state: 'failed', message: `Command succeeded but the spec was not written: ${missing.join(', ')}` });
  const broken = (component.openapi ?? []).map((rel) => loadOpenApiSpec(path.resolve(project.root, rel))).find((s) => s.error);
  if (broken) return done({ state: 'failed', message: `Generated spec is not valid: ${broken.error}` });
  return done({ state: 'ok', operations: specs.reduce((n, s) => n + (s.operations ?? 0), 0) });
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
