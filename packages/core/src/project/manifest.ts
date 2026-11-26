import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { AppEntity, Project } from '../types';

/**
 * Project model (PRODUCTCREATOR-8).
 *
 * A *project* is one repository opened in Product Creator. It consists of one or more
 * *services* (workspace packages such as `frontend`, `packages/*`, `integrations/*`).
 * Each service has its own feature catalog (functions, business objects, workflows, streams)
 * and optional code base, Prisma schema and OpenAPI specs.
 *
 * The model is read from `product-creator.yml` in the project root. Without that file the
 * services are discovered from the repository layout (pnpm-workspace.yaml / package.json workspaces).
 * All paths in the manifest are relative to the project root.
 */

export const MANIFEST_FILE = 'product-creator.yml';

export interface ServiceManifest {
  /** Service id, unique inside the project ([a-z0-9-]) */
  id: string;
  name: string;
  /** Service directory relative to the project root ('.' for single-service repos) */
  path: string;
  /** Feature catalog directory (functions/, business-objects/, workflows/, streams/) */
  catalog: string;
  /** Code base analysed by "sync from code" */
  codeBasePath?: string;
  /** Prisma schema used by "sync from schema" */
  dbSchemaPath?: string;
  /** OpenAPI specs provided by the service */
  openapi?: string[];
}

export interface ProjectManifest {
  id: string;
  name: string;
  description?: string;
  /** Absolute path of the project root */
  root: string;
  /** Sphinx docs directory relative to root */
  docs?: string;
  services: ServiceManifest[];
  /** 'file' when read from product-creator.yml, 'discovered' when derived from the repo layout */
  source: 'file' | 'discovered';
}

type RawService = Partial<ServiceManifest> & { path: string; openapi?: string | string[] };
interface RawManifest {
  id?: string;
  name?: string;
  description?: string;
  docs?: string;
  services?: RawService[];
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/^@[^/]+\//, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'root'
  );
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function readYaml<T>(file: string): T | null {
  try {
    return yaml.load(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage']);

/** Expand a workspace glob ('packages/*', 'frontend', 'integrations/**') to directories */
export function expandWorkspaceGlob(root: string, pattern: string): string[] {
  const segments = pattern.replace(/\/+$/, '').split('/').filter(Boolean);
  let current = [root];
  for (const segment of segments) {
    const next: string[] = [];
    for (const dir of current) {
      if (segment === '*' || segment === '**') {
        const children = listDirs(dir);
        next.push(...children);
        if (segment === '**') {
          // one extra level is enough for typical monorepos
          next.push(dir, ...children.flatMap(listDirs));
        }
      } else if (segment.includes('*')) {
        const re = new RegExp('^' + segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        next.push(...listDirs(dir).filter((d) => re.test(path.basename(d))));
      } else {
        const candidate = path.join(dir, segment);
        if (isDir(candidate)) next.push(candidate);
      }
    }
    current = next;
  }
  return Array.from(new Set(current));
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/** Workspace package globs from pnpm-workspace.yaml or package.json "workspaces" */
export function readWorkspaceGlobs(root: string): string[] {
  const pnpm = readYaml<{ packages?: string[] }>(path.join(root, 'pnpm-workspace.yaml'));
  if (pnpm?.packages?.length) return pnpm.packages;
  const pkg = readJson<{ workspaces?: string[] | { packages?: string[] } }>(path.join(root, 'package.json'));
  if (Array.isArray(pkg?.workspaces)) return pkg.workspaces;
  if (pkg?.workspaces && Array.isArray(pkg.workspaces.packages)) return pkg.workspaces.packages;
  return [];
}

const OPENAPI_CANDIDATES = [
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'dist/openapi.json',
  'dist/openapi.yaml',
  'docs/openapi.yaml',
  'docs/openapi.json',
  'api/openapi.yaml',
  'api/openapi.json',
  'public/openapi.json',
];

function rel(root: string, abs: string): string {
  return path.relative(root, abs) || '.';
}

/** Fill in defaults for a service from the files found in its directory */
function completeService(root: string, raw: RawService): ServiceManifest {
  const servicePath = raw.path || '.';
  const abs = path.resolve(root, servicePath);
  const pkg = readJson<{ name?: string }>(path.join(abs, 'package.json'));
  const id = raw.id ? slugify(raw.id) : slugify(servicePath === '.' ? pkg?.name || path.basename(root) : servicePath);
  const prisma = ['prisma/schema.prisma', 'schema.prisma'].map((p) => path.join(abs, p)).find((p) => fs.existsSync(p));
  const openapiRaw = raw.openapi === undefined ? undefined : Array.isArray(raw.openapi) ? raw.openapi : [raw.openapi];
  const openapi =
    openapiRaw ?? OPENAPI_CANDIDATES.map((c) => path.join(abs, c)).filter((p) => fs.existsSync(p)).map((p) => rel(root, p));
  return {
    id,
    name: raw.name || pkg?.name || (servicePath === '.' ? path.basename(root) : servicePath),
    path: servicePath,
    catalog: raw.catalog || path.join('docs/product', servicePath === '.' ? '' : servicePath) || 'docs/product',
    codeBasePath: raw.codeBasePath ?? servicePath,
    dbSchemaPath: raw.dbSchemaPath ?? (prisma ? rel(root, prisma) : undefined),
    openapi: openapi.length ? openapi : undefined,
  };
}

/** Discover services from the repository layout */
export function discoverServices(root: string): ServiceManifest[] {
  const globs = readWorkspaceGlobs(root).filter((g) => !g.startsWith('!'));
  const dirs = globs
    .flatMap((g) => expandWorkspaceGlob(root, g))
    .filter((d) => fs.existsSync(path.join(d, 'package.json')))
    .sort();
  if (dirs.length === 0) return [completeService(root, { path: '.' })];
  return dirs.map((d) => completeService(root, { path: rel(root, d) }));
}

/** Load a project from a folder: product-creator.yml if present, otherwise discovery */
export function loadProject(projectRoot: string): ProjectManifest {
  const root = path.resolve(projectRoot);
  if (!isDir(root)) throw new Error(`Project folder not found: ${root}`);
  const manifestPath = path.join(root, MANIFEST_FILE);
  const raw = fs.existsSync(manifestPath) ? readYaml<RawManifest>(manifestPath) : null;
  const pkg = readJson<{ name?: string; description?: string }>(path.join(root, 'package.json'));
  const services = raw?.services?.length ? raw.services.map((s) => completeService(root, s)) : discoverServices(root);
  return {
    id: slugify(raw?.id || path.basename(root)),
    name: raw?.name || pkg?.name || path.basename(root),
    description: raw?.description ?? pkg?.description,
    root,
    docs: raw?.docs ?? (isDir(path.join(root, 'docs')) ? 'docs' : undefined),
    services,
    source: raw ? 'file' : 'discovered',
  };
}

/** Serialize a project back to product-creator.yml content (paths stay relative) */
export function toManifestYaml(project: ProjectManifest): string {
  const data: RawManifest = {
    id: project.id,
    name: project.name,
    ...(project.description ? { description: project.description } : {}),
    ...(project.docs ? { docs: project.docs } : {}),
    services: project.services.map((s) => ({ ...s })),
  };
  return yaml.dump(data, { lineWidth: -1, noRefs: true });
}

/** Application id used in the UI/storage for a service of a project */
export function serviceAppId(projectId: string, serviceId: string): string {
  return `${projectId}.${serviceId}`;
}

/** Convert opened projects to the Project/AppEntity rows used by storage (absolute paths) */
export function toStorageEntities(projects: ProjectManifest[]): { projects: Project[]; apps: AppEntity[] } {
  return {
    projects: projects.map((p) => ({ id: p.id, name: p.name, description: p.description, locked: true })),
    apps: projects.flatMap((p) =>
      p.services.map((s) => ({
        id: serviceAppId(p.id, s.id),
        name: s.name,
        projectId: p.id,
        directory: path.resolve(p.root, s.catalog),
        codeBasePath: s.codeBasePath ? path.resolve(p.root, s.codeBasePath) : undefined,
        dbSchemaPath: s.dbSchemaPath ? path.resolve(p.root, s.dbSchemaPath) : undefined,
        openapi: s.openapi?.map((o) => path.resolve(p.root, o)),
        servicePath: s.path,
      }))
    ),
  };
}
