import * as fs from 'fs';
import * as path from 'path';
import { runCommand, startBackground, type BackgroundProcess } from '../process/command';
import { DEFAULT_READY_TIMEOUT_SEC, DEFAULT_SCREENSHOT_TIMEOUT_SEC, projectLanguages, type ProjectModel, type ScreenshotCommand } from '../project/model';
import type { FeatureScreen } from '../types';
import type { CatalogModel } from '../validation/model';
import { specOutputDir } from '../spec/output';

/**
 * Screenshots of the product UI for the spec (PRODUCTCREATOR-36).
 *
 * Product Creator does not capture by itself. It runs the project's commands from `screenshots` in
 * product-creator.yml — setup (in order) → start (background, wait for readyUrl) → capture → teardown (always) —
 * and talks to the capturer through two files:
 *
 *   request  <output>/screens.request.json   (path in PC_SCREENS_REQUEST)  what to capture
 *   result   <output>/screens.json                                         what was captured
 *
 * Images: <output>/<feature id>/<screen id>.png, output = <spec.output>/screens (committed with the spec).
 */
export const SCREENS_DIR = 'screens';
export const REQUEST_FILE = 'screens.request.json';
export const RESULT_FILE = 'screens.json';
export const SCREENS_FORMAT = 'product-creator.screens/1';

export interface ScreenRequest extends FeatureScreen {
  feature: string;
  /** Where the capturer writes the image, relative to the output folder */
  file: string;
}

export interface ScreensRequest {
  format: typeof SCREENS_FORMAT;
  /** Language of the UI to capture (PRODUCTCREATOR-37) */
  language: string;
  baseUrl?: string;
  /** Absolute output folder */
  output: string;
  screens: ScreenRequest[];
}

export interface ScreenResult {
  feature: string;
  id: string;
  file?: string;
  ok: boolean;
  error?: string;
}

export interface ScreensResult {
  screens: ScreenResult[];
}

export const screenFile = (feature: string, id: string) => `${feature.replace(/[^A-Za-z0-9_.-]/g, '_')}/${id}.png`;
/** Images of the primary language in screens/, of another language (screenshots.perLanguage) in screens/<lang>/ */
export const screensDir = (project: ProjectModel, language?: string) => {
  const base = path.join(specOutputDir(project), SCREENS_DIR);
  return language && language !== projectLanguages(project)[0] ? path.join(base, language) : base;
};

/** Screens declared by the features of the project (removed features left out) */
export function screensRequest(project: ProjectModel, model: CatalogModel, language = projectLanguages(project)[0]): ScreensRequest {
  const components = new Set(project.components.map((c) => c.id));
  const screens = model.features
    .filter((e) => e.component && components.has(e.component) && e.data.lifecycle !== 'removed')
    .flatMap((e) => (Array.isArray(e.data.screens) ? e.data.screens : []).map((s) => ({ ...s, feature: e.data.id, file: screenFile(e.data.id, s.id) })))
    .sort((a, b) => a.feature.localeCompare(b.feature) || a.id.localeCompare(b.id));
  return { format: SCREENS_FORMAT, language, baseUrl: project.screenshots?.baseUrl, output: screensDir(project, language), screens };
}

/** The capturer's result; missing or broken file = nothing captured */
export function readScreensResult(project: ProjectModel): ScreensResult {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(screensDir(project), RESULT_FILE), 'utf8')) as { screens?: unknown };
    const screens = (Array.isArray(raw.screens) ? raw.screens : []).flatMap((s): ScreenResult[] => {
      const r = (s ?? {}) as Record<string, unknown>;
      if (typeof r.feature !== 'string' || typeof r.id !== 'string') return [];
      return [{ feature: r.feature, id: r.id, ok: r.ok !== false, ...(typeof r.file === 'string' ? { file: r.file } : {}), ...(typeof r.error === 'string' ? { error: r.error } : {}) }];
    });
    return { screens };
  } catch {
    return { screens: [] };
  }
}

export type CaptureStep = 'setup' | 'start' | 'capture' | 'teardown';

export interface CaptureReport {
  state: 'ok' | 'failed' | 'cancelled' | 'skipped';
  message?: string;
  /** Screens requested / with an image after the run */
  requested: number;
  captured: number;
  failed: ScreenResult[];
  log: string;
}

export interface CaptureOptions {
  signal?: AbortSignal;
  onLog?: (chunk: string) => void;
  /** Polling of readyUrl (tests) */
  fetchImpl?: typeof fetch;
}

const MAX_REPORT_LOG = 100_000;

async function waitReady(url: string, timeoutSec: number, service: BackgroundProcess, options: CaptureOptions): Promise<void> {
  const deadline = Date.now() + timeoutSec * 1000;
  const fetchImpl = options.fetchImpl ?? fetch;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new Error('Cancelled');
    if (!service.running()) throw new Error(`exited before ${url} was ready`);
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(3000) });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} was not ready after ${timeoutSec}s`);
}

/**
 * Runs the screenshot commands of the project. Never throws for command failures: the report says what happened.
 * Teardown commands and background services are always stopped, also after a failure or cancel.
 */
export async function captureScreens(project: ProjectModel, model: CatalogModel, options: CaptureOptions = {}): Promise<CaptureReport> {
  let log = '';
  const write = (chunk: string) => {
    log = (log + chunk).slice(-MAX_REPORT_LOG);
    options.onLog?.(chunk);
  };
  const settings = project.screenshots;
  const request = screensRequest(project, model);
  const report = (state: CaptureReport['state'], message?: string): CaptureReport => {
    const result = readScreensResult(project);
    const captured = request.screens.filter((s) => fs.existsSync(path.join(request.output, s.file))).length;
    const failed = result.screens.filter((r) => !r.ok);
    return { state, message, requested: request.screens.length, captured, failed, log };
  };
  if (!settings) return report('skipped', 'No screenshots configured in product-creator.yml');
  if (!request.screens.length) return report('skipped', 'No feature declares screens');

  const primary = projectLanguages(project)[0];
  const languages = settings.perLanguage ? projectLanguages(project) : [primary];
  const requests = languages.map((language) => screensRequest(project, model, language));
  for (const r of requests) {
    fs.mkdirSync(r.output, { recursive: true });
    fs.writeFileSync(path.join(r.output, REQUEST_FILE), JSON.stringify(r, null, 2) + '\n');
    fs.rmSync(path.join(r.output, RESULT_FILE), { force: true });
  }
  const requestFile = path.join(request.output, REQUEST_FILE);
  const env = { ...settings.env, PC_SCREENS_REQUEST: requestFile, PC_SCREENS_OUTPUT: request.output, PC_SCREENS_LANGUAGE: primary, ...(settings.baseUrl ? { PC_BASE_URL: settings.baseUrl } : {}) };
  const cwdOf = (cmd: ScreenshotCommand) => path.resolve(project.root, cmd.cwd ?? '.');
  const run = (step: CaptureStep, cmd: ScreenshotCommand, extra: Record<string, string> = {}) => {
    write(`\n[${step}]\n`);
    return runCommand({ command: cmd.command, cwd: cwdOf(cmd), projectRoot: project.root, timeoutMs: (cmd.timeoutSec ?? DEFAULT_SCREENSHOT_TIMEOUT_SEC) * 1000, env: { ...env, ...extra }, signal: options.signal, onLog: write });
  };

  const services: BackgroundProcess[] = [];
  let outcome: CaptureReport['state'] = 'ok';
  let message: string | undefined;
  try {
    for (const cmd of settings.setup ?? []) {
      const r = await run('setup', cmd);
      if (r.state !== 'ok') throw Object.assign(new Error(`setup "${cmd.command}": ${r.message}`), { state: r.state });
    }
    for (const svc of settings.start ?? []) {
      write(`\n[start]\n`);
      const service = startBackground({ command: svc.command, cwd: cwdOf(svc), projectRoot: project.root, env, onLog: write });
      services.push(service);
      if (svc.readyUrl) {
        write(`waiting for ${svc.readyUrl}\n`);
        await waitReady(svc.readyUrl, svc.readyTimeoutSec ?? DEFAULT_READY_TIMEOUT_SEC, service, options);
        write(`ready: ${svc.readyUrl}\n`);
      }
    }
    for (const req of requests) {
      if (requests.length > 1) write(`\n[language ${req.language}]\n`);
      const r = await run('capture', settings.capture, { PC_SCREENS_REQUEST: path.join(req.output, REQUEST_FILE), PC_SCREENS_OUTPUT: req.output, PC_SCREENS_LANGUAGE: req.language });
      if (r.state !== 'ok') throw Object.assign(new Error(`capture "${settings.capture.command}"${requests.length > 1 ? ` (${req.language})` : ''}: ${r.message}`), { state: r.state });
      // images of screens that are no longer declared
      removeStaleImages(req);
    }
  } catch (error) {
    const state = (error as { state?: string }).state;
    outcome = state === 'cancelled' || options.signal?.aborted ? 'cancelled' : 'failed';
    message = error instanceof Error ? error.message : String(error);
    write(`\n[${outcome}] ${message}\n`);
  } finally {
    for (const r of requests) fs.rmSync(path.join(r.output, REQUEST_FILE), { force: true });
    for (const service of services.reverse()) await service.stop();
    for (const cmd of settings.teardown ?? []) {
      const r = await runCommand({ command: cmd.command, cwd: cwdOf(cmd), projectRoot: project.root, timeoutMs: (cmd.timeoutSec ?? DEFAULT_SCREENSHOT_TIMEOUT_SEC) * 1000, env, onLog: write }).catch(() => undefined);
      write(`\n[teardown] ${r?.state ?? 'failed'}\n`);
    }
  }
  const final = report(outcome, message);
  if (final.state === 'ok' && final.captured < final.requested) return { ...final, message: `${final.requested - final.captured} screen(s) without an image` };
  return final;
}

function removeStaleImages(request: ScreensRequest) {
  const wanted = new Set(request.screens.map((s) => path.join(request.output, s.file)));
  for (const dir of fs.readdirSync(request.output, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const folder = path.join(request.output, dir.name);
    for (const file of fs.readdirSync(folder)) {
      const abs = path.join(folder, file);
      if (file.endsWith('.png') && !wanted.has(abs)) fs.rmSync(abs);
    }
    if (!fs.readdirSync(folder).length) fs.rmdirSync(folder);
  }
}
