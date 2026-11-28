import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COMPONENT_FILES,
  deleteComponent,
  importNewComponents,
  isUuid,
  issueLink,
  openProject,
  PROJECT_FILE,
  readProject,
  saveComponent,
  toStorageEntities,
  updateProject,
} from '../src/project/model';

let root: string;

function write(rel: string, content: string | object) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}

/** Emperor-like monorepo: services in frontend/ and integrations/*, libraries in packages/* */
function monorepo() {
  write('package.json', { name: 'emperor', private: true });
  write('pnpm-workspace.yaml', 'packages:\n  - frontend\n  - packages/*\n  - integrations/*\n');
  write('frontend/package.json', { name: 'emperor-frontend', dependencies: { '@emperor/shared': 'workspace:*', react: '^19' } });
  write('frontend/prisma/schema.prisma', 'datasource db { provider = "postgresql" }\n');
  write('frontend/openapi.yaml', 'openapi: 3.0.0\ninfo: { title: t, version: "1" }\npaths: {}\n');
  write('packages/shared/package.json', { name: '@emperor/shared' });
  write('integrations/wb/package.json', { name: '@emperor/wb', dependencies: { '@emperor/shared': 'workspace:^' } });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-model-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('one-time import', () => {
  it('imports services and libraries with UUIDs and writes the YAML database', () => {
    monorepo();
    const { project, origin } = openProject(root);
    expect(origin).toBe('imported');
    expect(isUuid(project.id)).toBe(true);
    const bySlug = Object.fromEntries(project.components.map((c) => [c.slug, c]));
    expect(Object.keys(bySlug).sort()).toEqual(['frontend', 'integrations-wb', 'packages-shared']);
    expect(bySlug['packages-shared'].kind).toBe('library');
    expect(bySlug.frontend.kind).toBe('service');
    expect(bySlug.frontend.dbSchemaPath).toBe('frontend/prisma/schema.prisma');
    expect(bySlug.frontend.openapi).toEqual(['frontend/openapi.yaml']);
    expect(bySlug.frontend.dependsOn).toEqual([bySlug['packages-shared'].id]);
    expect(bySlug['integrations-wb'].dependsOn).toEqual([bySlug['packages-shared'].id]);
    project.components.forEach((c) => expect(isUuid(c.id)).toBe(true));

    expect(fs.existsSync(path.join(root, PROJECT_FILE))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/product/frontend', COMPONENT_FILES.service))).toBe(true);
    expect(fs.existsSync(path.join(root, 'docs/product/packages/shared', COMPONENT_FILES.library))).toBe(true);
  });

  it('does not re-run discovery on the next open', () => {
    monorepo();
    const first = openProject(root).project;
    write('packages/new-lib/package.json', { name: '@emperor/new-lib' });
    const second = openProject(root);
    expect(second.origin).toBe('read');
    expect(second.project.id).toBe(first.id);
    expect(second.project.components.map((c) => c.id).sort()).toEqual(first.components.map((c) => c.id).sort());
    // explicit import adds only the new folder
    const added = importNewComponents(root);
    expect(added.map((c) => c.slug)).toEqual(['packages-new-lib']);
    expect(readProject(root)!.components).toHaveLength(4);
  });

  it('single-package repo becomes one service', () => {
    write('package.json', { name: 'solo-app' });
    const { project } = openProject(root);
    expect(project.components).toHaveLength(1);
    expect(project.components[0]).toMatchObject({ kind: 'service', path: '.', slug: 'solo-app', catalog: 'docs/product/solo-app' });
  });

  it('takes only committed OpenAPI specs inside a git repository', () => {
    monorepo();
    write('frontend/dist/openapi.json', '{"openapi":"3.0.0","paths":{}}');
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', 'frontend/openapi.yaml', 'frontend/package.json'], { cwd: root });
    const frontend = openProject(root).project.components.find((c) => c.slug === 'frontend')!;
    expect(frontend.openapi).toEqual(['frontend/openapi.yaml']);
  });
});

describe('editing (UUID stability)', () => {
  it('rename keeps the id and references', () => {
    monorepo();
    const project = openProject(root).project;
    const shared = project.components.find((c) => c.slug === 'packages-shared')!;
    saveComponent(root, { ...shared, name: 'Shared kernel', slug: 'shared-kernel' });
    const after = readProject(root)!;
    const renamed = after.components.find((c) => c.id === shared.id)!;
    expect(renamed).toMatchObject({ slug: 'shared-kernel', name: 'Shared kernel', catalog: shared.catalog });
    expect(after.components.find((c) => c.slug === 'frontend')!.dependsOn).toEqual([shared.id]);

    updateProject(root, { name: 'Emperor', slug: 'emperor-renamed' });
    expect(readProject(root)!).toMatchObject({ id: project.id, slug: 'emperor-renamed', name: 'Emperor' });
  });

  it('creates, changes kind and deletes components', () => {
    monorepo();
    openProject(root);
    const created = saveComponent(root, { kind: 'service', slug: '', name: 'Billing API', path: 'apps/billing' });
    expect(isUuid(created.id)).toBe(true);
    expect(created).toMatchObject({ slug: 'billing-api', catalog: 'docs/product/apps/billing' });
    expect(() => saveComponent(root, { kind: 'service', slug: 'billing-api', name: 'x', path: 'apps/x' })).toThrow(/already used/);

    saveComponent(root, { ...created, kind: 'library' });
    const dir = path.join(root, created.catalog);
    expect(fs.existsSync(path.join(dir, COMPONENT_FILES.library))).toBe(true);
    expect(fs.existsSync(path.join(dir, COMPONENT_FILES.service))).toBe(false);

    const shared = readProject(root)!.components.find((c) => c.slug === 'packages-shared')!;
    fs.mkdirSync(path.join(root, shared.catalog, 'functions'), { recursive: true });
    fs.writeFileSync(path.join(root, shared.catalog, 'functions/f.yml'), 'id: f\n');
    deleteComponent(root, shared.id);
    const after = readProject(root)!;
    expect(after.components.find((c) => c.id === shared.id)).toBeUndefined();
    expect(after.components.find((c) => c.slug === 'frontend')!.dependsOn).toBeUndefined();
    expect(fs.existsSync(path.join(root, shared.catalog, 'functions/f.yml'))).toBe(true);
  });

  it('maps components to storage apps keyed by UUID', () => {
    monorepo();
    const project = openProject(root).project;
    const { projects, apps } = toStorageEntities([project]);
    expect(projects[0].id).toBe(project.id);
    expect(apps.map((a) => a.id).sort()).toEqual(project.components.map((c) => c.id).sort());
    expect(apps.find((a) => a.servicePath === 'packages/shared')!.name).toMatch(/\(lib\)$/);
  });
});

describe('migration from v1', () => {
  it('replaces slug ids by UUIDs and resolves dependsOn', () => {
    write(
      PROJECT_FILE,
      yaml.dump({
        id: 'legacy',
        name: 'Legacy',
        services: [
          { id: 'api', name: 'API', path: 'api', catalog: 'docs/product/api', dbSchemaPath: 'api/schema.prisma', dependsOn: ['core'] },
          { id: 'core', name: 'Core', path: 'packages/core', catalog: 'docs/product/core' },
          { id: 'old', name: 'Old', path: 'old', catalog: 'old/product' },
        ],
      })
    );
    const { project, origin, notes } = openProject(root);
    expect(origin).toBe('migrated');
    expect(project.slug).toBe('legacy');
    expect(isUuid(project.id)).toBe(true);
    const core = project.components.find((c) => c.slug === 'core')!;
    expect(core.kind).toBe('library');
    expect(project.components.find((c) => c.slug === 'api')!.dependsOn).toEqual([core.id]);
    expect(project.components.find((c) => c.slug === 'old')!.catalog).toBe('docs/product/old');
    expect(notes.some((n) => n.includes('outside catalogRoot'))).toBe(true);
    // stored as v2 and stable on re-open
    const again = openProject(root);
    expect(again.origin).toBe('read');
    expect(again.project.components.map((c) => c.id).sort()).toEqual(project.components.map((c) => c.id).sort());
  });
});

describe('safety', () => {
  it('refuses to import the home directory or filesystem root', () => {
    expect(() => openProject(os.homedir())).toThrow(/not a project folder/);
    expect(() => openProject(path.parse(process.cwd()).root)).toThrow(/not a project folder/);
  });
});

describe('product context (PRODUCTCREATOR-33)', () => {
  it('saves vision, goals, actors, glossary and tracker in product-creator.yml and reads them back', () => {
    monorepo();
    openProject(root);
    updateProject(root, {
      vision: 'Specs people and agents can check',
      goals: [{ id: 'G1', text: 'Planning errors are visible' }],
      actors: [{ id: 'ai_agent', name: 'AI agent', description: 'Plans and writes through MCP' }],
      glossary: [{ term: 'Feature', definition: 'A business capability' }],
      tracker: { issueUrl: 'https://example.youtrack.cloud/issue/{id}' },
    });
    const file = yaml.load(fs.readFileSync(path.join(root, PROJECT_FILE), 'utf8')) as Record<string, unknown>;
    expect(file.goals).toEqual([{ id: 'G1', text: 'Planning errors are visible' }]);
    const project = readProject(root)!;
    expect(project.actors?.[0]).toEqual({ id: 'ai_agent', name: 'AI agent', description: 'Plans and writes through MCP' });
    expect(issueLink(project.tracker, 'PC-12')).toBe('https://example.youtrack.cloud/issue/PC-12');

    // other edits keep the context; empty lists and null clear it
    updateProject(root, { name: 'Renamed' });
    expect(readProject(root)!.glossary).toHaveLength(1);
    updateProject(root, { glossary: [], tracker: null });
    expect(readProject(root)!).toMatchObject({ glossary: undefined, tracker: undefined, vision: 'Specs people and agents can check' });
  });

  it('external systems: saved with their events, ids unique and apart from actors (PRODUCTCREATOR-43)', () => {
    monorepo();
    openProject(root);
    updateProject(root, {
      actors: [{ id: 'developer', name: 'Developer' }],
      systems: [{ id: 'glitchtip', name: 'GlitchTip', description: 'Error tracker', emits: ['glitchtip.issue.created'], consumes: ['app.error.reported'] }],
    });
    expect(readProject(root)!.systems).toEqual([{ id: 'glitchtip', name: 'GlitchTip', description: 'Error tracker', emits: ['glitchtip.issue.created'], consumes: ['app.error.reported'] }]);
    expect(() => updateProject(root, { systems: [{ id: 'developer', name: 'x' }] })).toThrow(/actor id/);
    expect(() => updateProject(root, { systems: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] })).toThrow(/used twice/);
    expect(() => updateProject(root, { systems: [{ id: 'gt', name: 'GT', emits: ['Issue Created'] }] })).toThrow(/dotted/);
    updateProject(root, { systems: [] });
    expect(readProject(root)!.systems).toBeUndefined();
  });

  it('rejects bad ids, duplicates and a tracker URL without {id}', () => {
    monorepo();
    openProject(root);
    expect(() => updateProject(root, { goals: [{ id: 'goal-1', text: 'x' }] })).toThrow(/G1, G2/);
    expect(() => updateProject(root, { actors: [{ id: 'AI Agent', name: 'x' }] })).toThrow(/a-z, 0-9 and _/);
    expect(() => updateProject(root, { glossary: [{ term: 'Feature', definition: 'a' }, { term: 'feature', definition: 'b' }] })).toThrow(/used twice/);
    expect(() => updateProject(root, { tracker: { issueUrl: 'https://example.com/issue' } })).toThrow(/\{id\}/);
  });
});
