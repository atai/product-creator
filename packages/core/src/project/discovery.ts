import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import type { ComponentKind } from './model';

/**
 * Discovery of components (services and libraries) from a repository layout.
 * Used once, when a folder is opened for the first time (import), and on explicit
 * "Import new components" in the editor. Never on a regular start (YAML is the database).
 */

export interface DiscoveredComponent {
  kind: ComponentKind;
  slug: string;
  name: string;
  /** Component folder relative to the project root ('.' for single-package repos) */
  path: string;
  /** npm package name, used to resolve dependencies */
  packageName?: string;
  dbSchemaPath?: string;
  openapi?: string[];
  /** npm package names of workspace dependencies */
  dependsOnPackages: string[];
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

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function readYaml<T>(file: string): T | null {
  try {
    return yaml.load(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage']);

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function listDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

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
        if (segment === '**') next.push(dir, ...children.flatMap(listDirs));
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

/** Workspace package globs from pnpm-workspace.yaml or package.json "workspaces" */
export function readWorkspaceGlobs(root: string): string[] {
  const pnpm = readYaml<{ packages?: string[] }>(path.join(root, 'pnpm-workspace.yaml'));
  if (pnpm?.packages?.length) return pnpm.packages;
  const pkg = readJson<{ workspaces?: string[] | { packages?: string[] } }>(path.join(root, 'package.json'));
  if (Array.isArray(pkg?.workspaces)) return pkg.workspaces;
  if (pkg?.workspaces && Array.isArray(pkg.workspaces.packages)) return pkg.workspaces.packages;
  return [];
}

/** Interface spec files looked up in a component folder */
export const OPENAPI_CANDIDATES = [
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'docs/openapi.yaml',
  'docs/openapi.yml',
  'docs/openapi.json',
  'api/openapi.yaml',
  'api/openapi.json',
  'public/openapi.json',
  'dist/openapi.json',
  'dist/openapi.yaml',
];

/** Folders whose first path segment marks a library (shared package) */
const LIBRARY_ROOTS = new Set(['packages', 'libs', 'lib', 'shared', 'common']);

export function guessKind(relPath: string): ComponentKind {
  const segments = relPath.split('/');
  return segments.some((s, i) => (i === 0 || s === 'common') && LIBRARY_ROOTS.has(s)) ? 'library' : 'service';
}

/**
 * Files committed to git (default source of interface specs: committed files, not build output).
 * Outside a git repository every existing file counts as committed.
 */
export function filterCommitted(root: string, files: string[]): string[] {
  if (files.length === 0) return files;
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', ...files], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const tracked = new Set(out.split('\0').filter(Boolean));
    return files.filter((f) => tracked.has(f));
  } catch {
    return files;
  }
}

function rel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/') || '.';
}

function describe(root: string, abs: string): DiscoveredComponent {
  const relPath = rel(root, abs);
  const pkg = readJson<{
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  }>(path.join(abs, 'package.json'));
  const prisma = ['prisma/schema.prisma', 'schema.prisma'].map((p) => path.join(abs, p)).find((p) => fs.existsSync(p));
  const specs = filterCommitted(
    root,
    OPENAPI_CANDIDATES.map((c) => path.join(abs, c)).filter((p) => fs.existsSync(p)).map((p) => rel(root, p))
  );
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies, ...pkg?.peerDependencies };
  const baseName = relPath === '.' ? pkg?.name || path.basename(root) : relPath;
  return {
    kind: relPath === '.' ? 'service' : guessKind(relPath),
    slug: slugify(relPath === '.' ? pkg?.name || path.basename(root) : relPath),
    name: pkg?.name || baseName,
    path: relPath,
    packageName: pkg?.name,
    dbSchemaPath: prisma ? rel(root, prisma) : undefined,
    openapi: specs.length ? specs : undefined,
    dependsOnPackages: Object.entries(deps)
      .filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
      .map(([name]) => name),
  };
}

/** Discover components from the repository layout */
export function discoverComponents(root: string): DiscoveredComponent[] {
  const globs = readWorkspaceGlobs(root).filter((g) => !g.startsWith('!'));
  const dirs = globs
    .flatMap((g) => expandWorkspaceGlob(root, g))
    .filter((d) => fs.existsSync(path.join(d, 'package.json')))
    .sort();
  if (dirs.length === 0) return [describe(root, root)];
  return dirs.map((d) => describe(root, d));
}
