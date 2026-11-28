import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import yaml from 'js-yaml';
import type { AppEntity, Project } from '../types';
import { discoverComponents, guessKind, isDir, readJson, readYaml, slugify, type DiscoveredComponent } from './discovery';
import { stampTranslations } from '../i18n';
import productSchema from '../../schema/product.schema.json';

/**
 * Project model — YAML files laid out in the project folder are the database
 * (PRODUCTCREATOR-12, -13, -14).
 *
 *   <root>/product-creator.yml                      project (id, slug, name, catalogRoot, ...)
 *   <root>/<catalogRoot>/<...>/service.pc.yml       a service; its folder is the service catalog
 *   <root>/<catalogRoot>/<...>/library.pc.yml       a library; its folder is the library catalog
 *       features/ (old name: functions/) business-objects/ workflows/ streams/
 *
 * Ids are UUIDs generated once (import / create) and never change; `slug` and `name` are editable.
 * All references (dependsOn, storage app id, UI URLs, interface refs) use the UUID.
 */

export const PROJECT_FILE = 'product-creator.yml';
export const PROJECT_FORMAT_VERSION = 2;
export const COMPONENT_FILES = { service: 'service.pc.yml', library: 'library.pc.yml' } as const;
export const DEFAULT_CATALOG_ROOT = 'docs/product';

export type ComponentKind = 'service' | 'library';

/**
 * Command that generates the OpenAPI spec of a component (run by Product Creator).
 * `cwd` and the spec paths are relative to the project root; `cwd` defaults to the component folder.
 */
export interface OpenApiGenerate {
  /** Shell command, executed as configured (no arguments are appended or interpolated) */
  command: string;
  cwd?: string;
  /** Kill the command after this many seconds (default 120) */
  timeoutSec?: number;
}

export const DEFAULT_GENERATE_TIMEOUT_SEC = 120;
export const MAX_GENERATE_TIMEOUT_SEC = 3600;

export interface ComponentModel {
  /** Stable UUID */
  id: string;
  kind: ComponentKind;
  /** Human readable, unique inside the project ([a-z0-9-]) */
  slug: string;
  name: string;
  description?: string;
  /** Source folder relative to the project root ('.' for single-package repos) */
  path: string;
  /** Code base analysed by "sync from code" (relative to root) */
  codeBasePath?: string;
  /** Prisma schema used by "sync from schema" (relative to root) */
  dbSchemaPath?: string;
  /** Interface specs (OpenAPI), relative to root; default: files committed in the repo */
  openapi?: string[];
  /** How to generate the spec(s); the output path is listed in `openapi` */
  openapiGenerate?: OpenApiGenerate;
  /** UUIDs of components (usually libraries) this component depends on */
  dependsOn?: string[];
  /** Events the running component emits by itself, not through a feature: unhandled errors, start, scheduled jobs (PRODUCTCREATOR-43). Services only: a library runs inside a service */
  emits?: string[];
  /** Catalog folder relative to root = folder of the component file (derived, not stored) */
  catalog: string;
}

/** Product goal (PRODUCTCREATOR-33): G1, G2, … */
export interface ProductGoal {
  id: string;
  text: string;
}

/** Who uses the product; features refer to actors by id in `actors` */
export interface ProductActor {
  /** a-z, 0-9, _ (e.g. product_owner, ai_agent) */
  id: string;
  name: string;
  description?: string;
}

/** An external system the product works with (PRODUCTCREATOR-43): emits and consumes events, may perform a stream stage */
export interface ProductSystem {
  /** a-z, 0-9, _ (e.g. glitchtip); not an actor id */
  id: string;
  name: string;
  description?: string;
  /** Events it emits (they count as emitted in the event checks) */
  emits?: string[];
  /** Events it consumes */
  consumes?: string[];
}

/** Event names of systems: dotted, a-z, 0-9, _ (e.g. glitchtip.issue.created) */
export const EVENT_NAME = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface TrackerConfig {
  /** Link of an issue, `{id}` is replaced by the key: https://example.youtrack.cloud/issue/{id} */
  issueUrl: string;
}

/**
 * Spec generation settings (PRODUCTCREATOR-35). `language` is the language the catalog is written in (BCP 47,
 * default en): headings and labels of the generated spec come from the message catalog of that language.
 * `output` is the folder the spec is written to, relative to the project root (default docs/spec).
 */
export interface SpecSettings {
  language?: string;
  output?: string;
}

/** A command of the screenshot run (PRODUCTCREATOR-36); cwd relative to the project root */
export interface ScreenshotCommand {
  command: string;
  cwd?: string;
  timeoutSec?: number;
}

/** A long-running command (dev server, docker compose up); the run waits until readyUrl answers */
export interface ScreenshotService extends ScreenshotCommand {
  readyUrl?: string;
  readyTimeoutSec?: number;
}

/**
 * How screenshots of the product are captured (PRODUCTCREATOR-36). Product Creator runs setup (in order, to
 * completion) → start (background, waits for readyUrl) → capture (the project's capturer) → teardown (always).
 */
export interface ScreenshotSettings {
  /** Base URL of the running product, passed to the capturer (PC_BASE_URL) */
  baseUrl?: string;
  env?: Record<string, string>;
  setup?: ScreenshotCommand[];
  start?: ScreenshotService[];
  capture: ScreenshotCommand;
  teardown?: ScreenshotCommand[];
  /** Capture once per project language (PC_SCREENS_LANGUAGE), images in screens/<lang>/ (PRODUCTCREATOR-37) */
  perLanguage?: boolean;
}

export const DEFAULT_SCREENSHOT_TIMEOUT_SEC = 300;
export const DEFAULT_READY_TIMEOUT_SEC = 120;

/**
 * Design checks (PRODUCTCREATOR-34). advisory (default): every design check is reported one level below its intended
 * severity (error → warning, warning → info), so nothing is blocked; strict: intended severities. An override per
 * check code wins over the mode; `off` hides the check.
 */
export type CheckLevel = 'off' | 'info' | 'warning' | 'error';
export interface ChecksSettings {
  mode?: 'advisory' | 'strict';
  overrides?: Record<string, CheckLevel>;
}
const CHECK_LEVELS = new Set<CheckLevel>(['off', 'info', 'warning', 'error']);

export function readChecksSettings(raw: unknown): ChecksSettings | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const mode = r.mode === 'strict' || r.mode === 'advisory' ? r.mode : undefined;
  const overrides = typeof r.overrides === 'object' && r.overrides !== null ? Object.fromEntries(Object.entries(r.overrides as Record<string, unknown>).filter((e): e is [string, CheckLevel] => CHECK_LEVELS.has(e[1] as CheckLevel))) : {};
  if (!mode && !Object.keys(overrides).length) return undefined;
  return { ...(mode ? { mode } : {}), ...(Object.keys(overrides).length ? { overrides } : {}) };
}

export const DEFAULT_SPEC_LANGUAGE = 'en';
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Languages of the project content (PRODUCTCREATOR-37); the first is the primary one. Old projects: spec.language */
export const projectLanguages = (p: { languages?: string[]; spec?: SpecSettings }): string[] =>
  p.languages?.length ? p.languages : [p.spec?.language ?? DEFAULT_SPEC_LANGUAGE];
export const primaryLanguage = (p: { languages?: string[]; spec?: SpecSettings }): string => projectLanguages(p)[0];
export const DEFAULT_SPEC_OUTPUT = 'docs/spec';

/** Product-level context of a spec (PRODUCTCREATOR-33), stored in product-creator.yml */
export interface ProductContext {
  vision?: string;
  goals?: ProductGoal[];
  actors?: ProductActor[];
  /** External systems (PRODUCTCREATOR-43) */
  systems?: ProductSystem[];
  glossary?: GlossaryTerm[];
  tracker?: TrackerConfig;
  spec?: SpecSettings;
  screenshots?: ScreenshotSettings;
  checks?: ChecksSettings;
  /** Languages of the content, first = primary (PRODUCTCREATOR-37) */
  languages?: string[];
  /** Translations of the product context: i18n.<lang>.{vision, goals, actors, glossary} (PRODUCTCREATOR-37) */
  i18n?: Record<string, unknown>;
}

export const PRODUCT_KEYS = ['vision', 'goals', 'actors', 'systems', 'glossary', 'tracker'] as const;

export interface ProjectModel extends ProductContext {
  id: string;
  slug: string;
  name: string;
  description?: string;
  /** Sphinx docs folder relative to root */
  docs?: string;
  /** Folder (relative to root) containing component catalogs */
  catalogRoot: string;
  /** Absolute project root (derived) */
  root: string;
  components: ComponentModel[];
}

export interface OpenResult {
  project: ProjectModel;
  /** What happened on open: read existing files, imported from layout, or migrated from v1 */
  origin: 'read' | 'imported' | 'migrated';
  notes: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);
export const newId = (): string => randomUUID();

const toPosix = (p: string) => p.split(path.sep).join('/');
const relTo = (root: string, abs: string) => toPosix(path.relative(root, abs)) || '.';

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

interface RawProjectFile {
  version?: number;
  id?: string;
  slug?: string;
  name?: string;
  description?: string;
  docs?: string;
  catalogRoot?: string;
  vision?: unknown;
  goals?: unknown;
  actors?: unknown;
  systems?: unknown;
  glossary?: unknown;
  tracker?: unknown;
  spec?: unknown;
  screenshots?: unknown;
  checks?: unknown;
  languages?: unknown;
  i18n?: unknown;
  /** v1 format: inline services */
  services?: Array<Record<string, unknown>>;
}

interface RawOpenApi {
  spec?: string | string[];
  generate?: { command?: unknown; cwd?: unknown; timeoutSec?: unknown };
}
type RawComponentFile = Partial<Omit<ComponentModel, 'catalog' | 'kind' | 'openapi' | 'openapiGenerate'>> & {
  /** list / single path (committed specs) or { spec, generate } */
  openapi?: string | string[] | RawOpenApi;
};

const CATALOG_DIRS = new Set(['features', 'functions', 'business-objects', 'workflows', 'streams', 'node_modules', '.git']);

/** Find component files below catalogRoot (component folders may be nested, e.g. integrations/foo) */
function findComponentFiles(dir: string, depth = 0): { file: string; kind: ComponentKind }[] {
  if (depth > 8 || !isDir(dir)) return [];
  const found: { file: string; kind: ComponentKind }[] = [];
  for (const kind of ['service', 'library'] as const) {
    const file = path.join(dir, COMPONENT_FILES[kind]);
    if (fs.existsSync(file)) found.push({ file, kind });
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !CATALOG_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
      found.push(...findComponentFiles(path.join(dir, entry.name), depth + 1));
    }
  }
  return found;
}

/** Validate a project-relative path: no absolute paths, no escaping the project root */
export function assertInsideRoot(value: string, what: string) {
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${what} must be a path inside the project (got "${value}")`);
  }
}

/** Clean and validate a generate config; returns undefined when there is no command */
export function normalizeGenerate(input: { command?: unknown; cwd?: unknown; timeoutSec?: unknown } | undefined): OpenApiGenerate | undefined {
  if (!input) return undefined;
  const command = typeof input.command === 'string' ? input.command.trim() : '';
  if (!command) return undefined;
  if (/[\r\n\0]/.test(command)) throw new Error('OpenAPI generate command must be a single line');
  const cwd = typeof input.cwd === 'string' && input.cwd.trim() ? input.cwd.trim() : undefined;
  if (cwd) assertInsideRoot(cwd, 'OpenAPI generate cwd');
  let timeoutSec: number | undefined;
  if (input.timeoutSec !== undefined && input.timeoutSec !== null && input.timeoutSec !== '') {
    timeoutSec = Number(input.timeoutSec);
    if (!Number.isInteger(timeoutSec) || timeoutSec < 1 || timeoutSec > MAX_GENERATE_TIMEOUT_SEC) {
      throw new Error(`OpenAPI generate timeoutSec must be an integer between 1 and ${MAX_GENERATE_TIMEOUT_SEC}`);
    }
  }
  return { command, cwd, timeoutSec };
}

/** Read the `openapi` YAML value in any supported shape */
function parseOpenApi(raw: RawComponentFile['openapi']): { specs?: string[]; generate?: OpenApiGenerate } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { specs: asList(raw.spec), generate: normalizeGenerate(raw.generate) };
  }
  return { specs: asList(raw as string | string[] | undefined) };
}

function asList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const list = (Array.isArray(value) ? value : [value]).filter((v) => typeof v === 'string' && v.trim());
  return list.length ? list : undefined;
}

export function readComponentFile(root: string, file: string, kind: ComponentKind): ComponentModel {
  const raw = readYaml<RawComponentFile>(file);
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid component file ${file}`);
  if (!isUuid(raw.id)) throw new Error(`${relTo(root, file)}: "id" must be a UUID`);
  const catalog = relTo(root, path.dirname(file));
  const slug = raw.slug || slugify(path.basename(path.dirname(file)));
  return {
    id: raw.id,
    kind,
    slug,
    name: raw.name || slug,
    description: raw.description || undefined,
    path: raw.path || '.',
    codeBasePath: raw.codeBasePath || undefined,
    dbSchemaPath: raw.dbSchemaPath || undefined,
    openapi: parseOpenApi(raw.openapi).specs,
    openapiGenerate: parseOpenApi(raw.openapi).generate,
    dependsOn: asList(raw.dependsOn),
    emits: asList(raw.emits),
    catalog,
  };
}

/** Read a v2 project. Returns null when product-creator.yml is missing or in v1 format. */
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : []);
const nonEmpty = <T,>(list: T[]): T[] | undefined => (list.length ? list : undefined);

/** Product context from product-creator.yml; malformed items are dropped (the file stays editable by hand) */
export function readProductContext(raw: { vision?: unknown; goals?: unknown; actors?: unknown; systems?: unknown; glossary?: unknown; tracker?: unknown; spec?: unknown }): ProductContext {
  const tracker = typeof raw.tracker === 'object' && raw.tracker !== null ? str((raw.tracker as Record<string, unknown>).issueUrl) : undefined;
  const specRaw = typeof raw.spec === 'object' && raw.spec !== null ? (raw.spec as Record<string, unknown>) : {};
  const spec: SpecSettings = { ...(str(specRaw.language) ? { language: str(specRaw.language) } : {}), ...(str(specRaw.output) ? { output: str(specRaw.output) } : {}) };
  return {
    spec: Object.keys(spec).length ? spec : undefined,
    vision: str(raw.vision),
    goals: nonEmpty(records(raw.goals).flatMap((g) => (str(g.id) && str(g.text) ? [{ id: str(g.id) as string, text: str(g.text) as string }] : []))),
    actors: nonEmpty(
      records(raw.actors).flatMap((a) =>
        str(a.id) && str(a.name) ? [{ id: str(a.id) as string, name: str(a.name) as string, ...(str(a.description) ? { description: str(a.description) } : {}) }] : []
      )
    ),
    systems: nonEmpty(
      records(raw.systems).flatMap((x) => {
        const id = str(x.id);
        const name = str(x.name);
        if (!id || !name) return [];
        const events = (v: unknown) => nonEmpty((Array.isArray(v) ? v : []).flatMap((e) => (str(e) ? [str(e) as string] : [])));
        const emits = events(x.emits);
        const consumes = events(x.consumes);
        return [{ id, name, ...(str(x.description) ? { description: str(x.description) } : {}), ...(emits ? { emits } : {}), ...(consumes ? { consumes } : {}) }];
      })
    ),
    glossary: nonEmpty(records(raw.glossary).flatMap((t) => (str(t.term) && str(t.definition) ? [{ term: str(t.term) as string, definition: str(t.definition) as string }] : []))),
    tracker: tracker ? { issueUrl: tracker } : undefined,
  };
}

const commandOf = (v: unknown): ScreenshotCommand | undefined => {
  const r = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : typeof v === 'string' ? { command: v } : {};
  const command = str(r.command);
  if (!command) return undefined;
  const timeout = Number(r.timeoutSec);
  return { command, ...(str(r.cwd) ? { cwd: str(r.cwd) } : {}), ...(Number.isFinite(timeout) && timeout > 0 ? { timeoutSec: timeout } : {}) };
};
const commandsOf = (v: unknown): ScreenshotCommand[] => (Array.isArray(v) ? v : v ? [v] : []).flatMap((c) => (commandOf(c) ? [commandOf(c) as ScreenshotCommand] : []));

/** `screenshots` of product-creator.yml; a single command may be written as a string. No capture command = not configured */
export function readScreenshotSettings(raw: unknown): ScreenshotSettings | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const capture = commandOf(r.capture);
  if (!capture) return undefined;
  const env = typeof r.env === 'object' && r.env !== null ? Object.fromEntries(Object.entries(r.env as Record<string, unknown>).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)])) : {};
  const start = (Array.isArray(r.start) ? r.start : r.start ? [r.start] : []).flatMap((item): ScreenshotService[] => {
    const c = commandOf(item);
    if (!c) return [];
    const o = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const ready = Number(o.readyTimeoutSec);
    return [{ ...c, ...(str(o.readyUrl) ? { readyUrl: str(o.readyUrl) } : {}), ...(Number.isFinite(ready) && ready > 0 ? { readyTimeoutSec: ready } : {}) }];
  });
  const setup = commandsOf(r.setup);
  const teardown = commandsOf(r.teardown);
  return {
    ...(str(r.baseUrl) ? { baseUrl: str(r.baseUrl) } : {}),
    ...(Object.keys(env).length ? { env } : {}),
    ...(setup.length ? { setup } : {}),
    ...(start.length ? { start } : {}),
    capture,
    ...(teardown.length ? { teardown } : {}),
    ...(r.perLanguage === true ? { perLanguage: true } : {}),
  };
}

function readLanguages(raw: unknown): string[] | undefined {
  const list = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []).map((l) => String(l).trim()).filter((l) => LANGUAGE_TAG.test(l));
  return list.length ? [...new Set(list)] : undefined;
}

/** Rejects a product context that cannot be saved: ids, duplicates, tracker URL */
export function assertProductContext(c: ProductContext) {
  const unique = (values: string[], what: string) => {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v.toLowerCase())) throw new Error(`${what} "${v}" is used twice`);
      seen.add(v.toLowerCase());
    }
  };
  for (const g of c.goals ?? []) if (!/^G[1-9][0-9]*$/.test(g.id)) throw new Error(`Goal id "${g.id}" must be G1, G2, …`);
  for (const a of c.actors ?? []) if (!/^[a-z0-9_]+$/.test(a.id)) throw new Error(`Actor id "${a.id}" must use a-z, 0-9 and _ (e.g. product_owner)`);
  unique((c.goals ?? []).map((g) => g.id), 'Goal id');
  unique((c.actors ?? []).map((a) => a.id), 'Actor id');
  for (const x of c.systems ?? []) {
    if (!/^[a-z0-9_]+$/.test(x.id)) throw new Error(`System id "${x.id}" must use a-z, 0-9 and _ (e.g. glitchtip)`);
    if ((c.actors ?? []).some((a) => a.id === x.id)) throw new Error(`System id "${x.id}" is an actor id: a system and an actor cannot share an id`);
    for (const e of [...(x.emits ?? []), ...(x.consumes ?? [])]) if (!EVENT_NAME.test(e)) throw new Error(`Event "${e}" of system ${x.id} must be dotted a-z, 0-9, _ (e.g. glitchtip.issue.created)`);
  }
  unique((c.systems ?? []).map((x) => x.id), 'System id');
  unique((c.glossary ?? []).map((t) => t.term), 'Glossary term');
  if (c.languages) {
    for (const l of c.languages) if (!LANGUAGE_TAG.test(l)) throw new Error(`Language "${l}" must be a tag like en, ru or pt-BR`);
    if (new Set(c.languages).size !== c.languages.length) throw new Error('languages must not repeat');
  }
  if (c.spec?.language && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(c.spec.language)) {
    throw new Error(`spec.language "${c.spec.language}" must be a language tag like en, ru or pt-BR`);
  }
  if (c.spec?.output && (path.isAbsolute(c.spec.output) || c.spec.output.split(/[\\/]/).includes('..'))) {
    throw new Error('spec.output must be a folder inside the project, e.g. docs/spec');
  }
  if (c.screenshots) {
    const s = c.screenshots;
    for (const cmd of [...(s.setup ?? []), ...(s.start ?? []), s.capture, ...(s.teardown ?? [])]) if (cmd.cwd) assertInsideRoot(cmd.cwd, 'screenshots command cwd');
    for (const url of [s.baseUrl, ...(s.start ?? []).map((x) => x.readyUrl)]) {
      if (url && !/^https?:\/\//.test(url) && !/^[a-z][a-z0-9+.-]*:/.test(url)) throw new Error(`screenshots URL "${url}" must be absolute, e.g. http://localhost:3000`);
    }
  }
  if (c.tracker && !(/^https?:\/\//.test(c.tracker.issueUrl) && c.tracker.issueUrl.includes('{id}'))) {
    throw new Error('tracker.issueUrl must be an http(s) URL with {id}, e.g. https://example.youtrack.cloud/issue/{id}');
  }
}

/** Link of a tracker issue, or null when the project has no tracker */
export const issueLink = (tracker: TrackerConfig | undefined, key: string): string | null =>
  tracker ? tracker.issueUrl.replace('{id}', encodeURIComponent(key.replace(/^#/, ''))) : null;

export function readProject(rootDir: string): ProjectModel | null {
  const root = path.resolve(rootDir);
  const raw = readYaml<RawProjectFile>(path.join(root, PROJECT_FILE));
  if (!raw || raw.version !== PROJECT_FORMAT_VERSION) return null;
  if (!isUuid(raw.id)) throw new Error(`${PROJECT_FILE}: "id" must be a UUID`);
  const catalogRoot = raw.catalogRoot || DEFAULT_CATALOG_ROOT;
  const components = findComponentFiles(path.join(root, catalogRoot))
    .map(({ file, kind }) => readComponentFile(root, file, kind))
    .sort((a, b) => a.catalog.localeCompare(b.catalog));
  const seen = new Set<string>();
  for (const c of components) {
    if (seen.has(c.id)) throw new Error(`Duplicate component id ${c.id} (${c.catalog})`);
    seen.add(c.id);
  }
  const slug = raw.slug || slugify(raw.name || path.basename(root));
  return {
    id: raw.id,
    slug,
    name: raw.name || slug,
    description: raw.description || undefined,
    docs: raw.docs || undefined,
    catalogRoot,
    ...readProductContext(raw),
    screenshots: readScreenshotSettings(raw.screenshots),
    checks: readChecksSettings(raw.checks),
    languages: readLanguages(raw.languages),
    i18n: typeof raw.i18n === 'object' && raw.i18n !== null ? (raw.i18n as Record<string, unknown>) : undefined,
    root,
    components,
  };
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function dump(data: Record<string, unknown>): string {
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
  );
  return yaml.dump(clean, { lineWidth: 120, noRefs: true });
}

export function projectFileContent(project: ProjectModel): string {
  return (
    '# Product Creator project (https://github.com/atai/product-creator)\n' +
    '# Components live in <catalogRoot>/**/service.pc.yml and library.pc.yml. Edit in the app.\n' +
    dump({
      version: PROJECT_FORMAT_VERSION,
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      docs: project.docs,
      catalogRoot: project.catalogRoot,
      vision: project.vision,
      goals: project.goals,
      actors: project.actors,
      systems: project.systems,
      glossary: project.glossary,
      tracker: project.tracker,
      spec: project.spec,
      screenshots: project.screenshots,
      checks: project.checks,
      languages: project.languages,
      i18n: project.i18n,
    })
  );
}

export function componentFileContent(c: ComponentModel): string {
  return dump({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    path: c.path,
    codeBasePath: c.codeBasePath,
    dbSchemaPath: c.dbSchemaPath,
    openapi: c.openapiGenerate
      ? { spec: c.openapi?.length === 1 ? c.openapi[0] : c.openapi, generate: stripUndefined({ ...c.openapiGenerate }) }
      : c.openapi,
    dependsOn: c.dependsOn,
    emits: c.emits,
  });
}

function writeFile(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

export function writeProjectFile(project: ProjectModel) {
  writeFile(path.join(project.root, PROJECT_FILE), projectFileContent(project));
}

export function writeComponentFile(project: ProjectModel, c: ComponentModel) {
  const dir = path.join(project.root, c.catalog);
  writeFile(path.join(dir, COMPONENT_FILES[c.kind]), componentFileContent(c));
  // Kind changed: remove the file of the other kind
  const other = path.join(dir, COMPONENT_FILES[c.kind === 'service' ? 'library' : 'service']);
  if (fs.existsSync(other)) fs.unlinkSync(other);
}

export function writeProject(project: ProjectModel) {
  writeProjectFile(project);
  project.components.forEach((c) => writeComponentFile(project, c));
}

// ---------------------------------------------------------------------------------------------
// Import (one-time) and migration from v1
// ---------------------------------------------------------------------------------------------

function uniqueSlug(slug: string, taken: Set<string>): string {
  let candidate = slug;
  for (let i = 2; taken.has(candidate); i++) candidate = `${slug}-${i}`;
  taken.add(candidate);
  return candidate;
}

function defaultCatalog(catalogRoot: string, c: { path: string; slug: string }): string {
  return toPosix(path.posix.join(catalogRoot, c.path === '.' ? c.slug : c.path));
}

/** Turn discovered components into models (new UUIDs, dependencies resolved to UUIDs) */
export function componentsFromDiscovery(
  discovered: DiscoveredComponent[],
  catalogRoot: string,
  existing: ComponentModel[] = []
): ComponentModel[] {
  const taken = new Set(existing.map((c) => c.slug));
  const usedCatalogs = new Set(existing.map((c) => c.catalog));
  const created = discovered.map((d) => {
    const slug = uniqueSlug(d.slug, taken);
    let catalog = defaultCatalog(catalogRoot, { path: d.path, slug });
    if (usedCatalogs.has(catalog)) catalog = defaultCatalog(catalogRoot, { path: '.', slug });
    usedCatalogs.add(catalog);
    return { d, model: { id: newId(), kind: d.kind, slug, name: d.name, path: d.path, dbSchemaPath: d.dbSchemaPath, openapi: d.openapi, openapiGenerate: d.openapiGenerate && { command: d.openapiGenerate.command }, catalog } as ComponentModel };
  });
  // Resolve workspace dependencies (package names) to component UUIDs
  const byPackage = new Map<string, string>();
  for (const { d, model } of created) if (d.packageName) byPackage.set(d.packageName, model.id);
  for (const c of existing) if (c.name) byPackage.set(c.name, c.id);
  for (const { d, model } of created) {
    const deps = d.dependsOnPackages.map((p) => byPackage.get(p)).filter((id): id is string => Boolean(id) && id !== model.id);
    if (deps.length) model.dependsOn = deps;
  }
  return created.map((x) => x.model);
}

function migrateV1(root: string, raw: RawProjectFile, notes: string[]): ProjectModel {
  const catalogRoot = raw.catalogRoot || DEFAULT_CATALOG_ROOT;
  const taken = new Set<string>();
  const oldIdToUuid = new Map<string, string>();
  const components: ComponentModel[] = (raw.services ?? []).map((s) => {
    const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : undefined);
    const p = str('path') || '.';
    const slug = uniqueSlug(slugify(str('id') || str('name') || p), taken);
    const id = isUuid(s.id) ? (s.id as string) : newId();
    oldIdToUuid.set(str('id') || slug, id);
    let catalog = str('catalog') ? toPosix(path.normalize(str('catalog') as string)) : defaultCatalog(catalogRoot, { path: p, slug });
    if (catalog === '..' || catalog.startsWith('../') || !(catalog + '/').startsWith(catalogRoot.replace(/\/?$/, '/'))) {
      const moved = defaultCatalog(catalogRoot, { path: '.', slug });
      notes.push(`${slug}: catalog "${catalog}" is outside catalogRoot "${catalogRoot}", component placed in "${moved}"`);
      catalog = moved;
    }
    const kind: ComponentKind = s.kind === 'library' ? 'library' : s.kind === 'service' ? 'service' : p === '.' ? 'service' : guessKind(p);
    return {
      id,
      kind,
      slug,
      name: str('name') || slug,
      description: str('description'),
      path: p,
      codeBasePath: str('codeBasePath'),
      dbSchemaPath: str('dbSchemaPath'),
      openapi: asList(s.openapi as string | string[] | undefined),
      dependsOn: asList(s.dependsOn as string[] | undefined),
      catalog,
    };
  });
  for (const c of components) {
    if (c.dependsOn) c.dependsOn = c.dependsOn.map((d) => oldIdToUuid.get(d) ?? d).filter(isUuid);
  }
  notes.push(`Migrated ${PROJECT_FILE} from v1 (${components.length} components, ids replaced by UUIDs)`);
  const slug = slugify(raw.slug || (typeof raw.id === 'string' && !isUuid(raw.id) ? raw.id : '') || raw.name || path.basename(root));
  return {
    id: isUuid(raw.id) ? raw.id : newId(),
    slug,
    name: raw.name || slug,
    description: raw.description,
    docs: raw.docs || (isDir(path.join(root, 'docs/source')) ? 'docs' : undefined),
    catalogRoot,
    root,
    components,
  };
}

/** Build a project model from the repository layout (no files written) */
export function importFromLayout(rootDir: string): ProjectModel {
  const root = path.resolve(rootDir);
  const pkg = readJson<{ name?: string; description?: string }>(path.join(root, 'package.json'));
  const name = pkg?.name || path.basename(root);
  const catalogRoot = DEFAULT_CATALOG_ROOT;
  return {
    id: newId(),
    slug: slugify(name),
    name,
    description: pkg?.description,
    docs: isDir(path.join(root, 'docs/source')) ? 'docs' : undefined,
    catalogRoot,
    root,
    components: componentsFromDiscovery(discoverComponents(root), catalogRoot),
  };
}

/**
 * Open a project folder. Reads the YAML database; on the first open (no product-creator.yml)
 * imports the model from the repository layout once and writes it; a v1 file is migrated.
 */
export function openProject(rootDir: string): OpenResult {
  const root = path.resolve(rootDir);
  if (!isDir(root)) throw new Error(`Folder not found: ${root}`);
  if (root === path.parse(root).root || root === os.homedir()) {
    throw new Error(`${root} is not a project folder (filesystem root / home directory). Open a repository folder.`);
  }
  const existing = readProject(root);
  if (existing) return { project: existing, origin: 'read', notes: [] };
  const raw = readYaml<RawProjectFile>(path.join(root, PROJECT_FILE));
  const notes: string[] = [];
  if (raw && typeof raw === 'object') {
    const project = migrateV1(root, raw, notes);
    writeProject(project);
    return { project, origin: 'migrated', notes };
  }
  const project = importFromLayout(root);
  writeProject(project);
  notes.push(`Imported ${project.components.length} components from the folder layout`);
  return { project, origin: 'imported', notes };
}

// ---------------------------------------------------------------------------------------------
// Editing (used by the UI editor)
// ---------------------------------------------------------------------------------------------

/** Strings: '' clears; product lists: [] clears; tracker: null clears */
export type ProjectPatch = Partial<Pick<ProjectModel, 'slug' | 'name' | 'description' | 'docs' | 'catalogRoot' | 'vision' | 'goals' | 'actors' | 'systems' | 'glossary'>> & {
  tracker?: TrackerConfig | null;
  spec?: SpecSettings | null;
  screenshots?: ScreenshotSettings | null;
  checks?: ChecksSettings | null;
  /** [] or null: back to the default (en) */
  languages?: string[] | null;
  i18n?: Record<string, unknown> | null;
};
export type ComponentInput = Omit<ComponentModel, 'id' | 'catalog'> & { id?: string; catalog?: string };

function load(rootDir: string): ProjectModel {
  const project = readProject(rootDir);
  if (!project) throw new Error(`No ${PROJECT_FILE} (v${PROJECT_FORMAT_VERSION}) in ${rootDir}`);
  return project;
}

function assertSlug(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`Invalid slug "${slug}" (use a-z, 0-9 and -)`);
}

export function updateProject(rootDir: string, patch: ProjectPatch): ProjectModel {
  const project = load(rootDir);
  const next: ProjectModel = { ...project };
  for (const key of ['slug', 'name', 'description', 'docs', 'catalogRoot', 'vision'] as const) {
    if (patch[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = patch[key]?.trim() || undefined;
  }
  // product context (PRODUCTCREATOR-33): normalised like on read, then checked
  const product = readProductContext({ goals: patch.goals, actors: patch.actors, systems: patch.systems, glossary: patch.glossary, tracker: patch.tracker, spec: patch.spec });
  if (patch.spec !== undefined) next.spec = product.spec;
  if (patch.languages !== undefined) next.languages = patch.languages?.length ? patch.languages.map((l) => l.trim()).filter(Boolean) : undefined;
  if (patch.i18n !== undefined) next.i18n = patch.i18n ?? undefined;
  if (patch.checks !== undefined) next.checks = patch.checks ? readChecksSettings(patch.checks) : undefined;
  if (patch.screenshots !== undefined) next.screenshots = patch.screenshots ? readScreenshotSettings(patch.screenshots) : undefined;
  if (patch.goals !== undefined) next.goals = product.goals;
  if (patch.actors !== undefined) next.actors = product.actors;
  if (patch.systems !== undefined) next.systems = product.systems;
  if (patch.glossary !== undefined) next.glossary = product.glossary;
  if (patch.tracker !== undefined) next.tracker = product.tracker;
  // translations of the product context get fingerprints of their primary texts, after every text of the patch is in (PRODUCTCREATOR-37)
  if (next.i18n) next.i18n = (stampTranslations(project, { ...next }, productSchema) as ProjectModel).i18n;
  assertProductContext(next);
  next.slug = next.slug || slugify(next.name || path.basename(project.root));
  next.name = next.name || next.slug;
  next.catalogRoot = next.catalogRoot || DEFAULT_CATALOG_ROOT;
  assertSlug(next.slug);
  if (next.catalogRoot !== project.catalogRoot && project.components.some((c) => !c.catalog.startsWith(next.catalogRoot + '/'))) {
    throw new Error('catalogRoot can only be changed when all component folders are inside the new root');
  }
  writeProjectFile(next);
  return load(rootDir);
}

/** Create (no id) or update a component. Returns the saved component. */
export function saveComponent(rootDir: string, input: ComponentInput): ComponentModel {
  const project = load(rootDir);
  const slug = (input.slug || slugify(input.name || input.path || 'component')).trim();
  assertSlug(slug);
  if (!input.path?.trim()) throw new Error('"path" is required');
  if (project.components.some((c) => c.slug === slug && c.id !== input.id)) throw new Error(`Slug "${slug}" is already used`);
  const openapiGenerate = normalizeGenerate(input.openapiGenerate);
  (input.openapi ?? []).filter((s) => s.trim()).forEach((s) => assertInsideRoot(s.trim(), 'OpenAPI spec path'));
  const ids = new Set(project.components.map((c) => c.id));
  const dependsOn = (input.dependsOn ?? []).filter((d) => ids.has(d) && d !== input.id);
  const emits = asList((input.emits ?? []).map((e) => e.trim()).filter(Boolean));
  for (const e of emits ?? []) if (!EVENT_NAME.test(e)) throw new Error(`Event "${e}" must be dotted a-z, 0-9, _ (e.g. app.error.raised)`);

  const current = input.id ? project.components.find((c) => c.id === input.id) : undefined;
  if (input.id && !current) throw new Error(`Component ${input.id} not found`);
  const catalog = current?.catalog ?? (input.catalog?.trim() || defaultCatalog(project.catalogRoot, { path: input.path, slug }));
  if (!current && project.components.some((c) => c.catalog === catalog)) throw new Error(`Folder ${catalog} already holds a component`);
  if (!current && !(catalog + '/').startsWith(project.catalogRoot + '/')) throw new Error(`Catalog folder must be inside ${project.catalogRoot}`);

  const component: ComponentModel = {
    id: current?.id ?? newId(),
    kind: input.kind === 'library' ? 'library' : 'service',
    slug,
    name: input.name?.trim() || slug,
    description: input.description?.trim() || undefined,
    path: input.path.trim(),
    codeBasePath: input.codeBasePath?.trim() || undefined,
    dbSchemaPath: input.dbSchemaPath?.trim() || undefined,
    openapi: asList((input.openapi ?? []).map((s) => s.trim())),
    openapiGenerate,
    dependsOn: dependsOn.length ? dependsOn : undefined,
    emits,
    catalog,
  };
  writeComponentFile(project, component);
  return component;
}

/** Delete a component file (catalog content is kept) and drop references to it */
export function deleteComponent(rootDir: string, id: string): void {
  const project = load(rootDir);
  const component = project.components.find((c) => c.id === id);
  if (!component) throw new Error(`Component ${id} not found`);
  fs.unlinkSync(path.join(project.root, component.catalog, COMPONENT_FILES[component.kind]));
  for (const other of project.components) {
    if (other.dependsOn?.includes(id)) {
      const dependsOn = other.dependsOn.filter((d) => d !== id);
      writeComponentFile(project, { ...other, dependsOn: dependsOn.length ? dependsOn : undefined });
    }
  }
}

/** Add components found in the folder layout that are not in the model yet (matched by path) */
export function importNewComponents(rootDir: string): ComponentModel[] {
  const project = load(rootDir);
  const known = new Set(project.components.map((c) => c.path));
  const fresh = discoverComponents(project.root).filter((d) => !known.has(d.path));
  const created = componentsFromDiscovery(fresh, project.catalogRoot, project.components);
  created.forEach((c) => writeComponentFile(project, c));
  return created;
}

// ---------------------------------------------------------------------------------------------
// Storage mapping
// ---------------------------------------------------------------------------------------------

/** Map project models to storage entities (projects + apps; app id = component UUID) */
export function toStorageEntities(projects: ProjectModel[]): { projects: Project[]; apps: AppEntity[] } {
  return {
    projects: projects.map((p) => ({ id: p.id, name: p.name, description: p.description, root: p.root })),
    apps: projects.flatMap((p) =>
      p.components.map(
        (c): AppEntity => ({
          id: c.id,
          name: c.kind === 'library' ? `${c.name} (lib)` : c.name,
          projectId: p.id,
          directory: path.join(p.root, c.catalog),
          codeBasePath: path.join(p.root, c.codeBasePath ?? c.path),
          dbSchemaPath: c.dbSchemaPath ? path.join(p.root, c.dbSchemaPath) : undefined,
          openapi: c.openapi?.map((s) => path.join(p.root, s)),
          servicePath: c.path,
        })
      )
    ),
  };
}
