import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenApiGenerationManager, runOpenApiGenerate } from '../src/interfaces/generator';
import { detectOpenApiGenerator } from '../src/project/discovery';
import {
  COMPONENT_FILES,
  normalizeGenerate,
  openProject,
  readProject,
  saveComponent,
  type ComponentModel,
  type ProjectModel,
} from '../src/project/model';

let root: string;
const write = (rel: string, content: string | object) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
};
const SPEC = JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: { '/a': { get: {} }, '/b': { post: {}, get: {} } } });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-gen-'));
  write('package.json', { name: 'mono' });
  write('pnpm-workspace.yaml', 'packages:\n  - svc\n');
  write('svc/package.json', { name: 'svc', scripts: { 'generate:openapi': 'node gen.js' } });
  write('svc/gen.js', `require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/openapi.json', ${JSON.stringify(SPEC)});console.log('written');`);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function setup(command: string, extra: Partial<ComponentModel> = {}): { project: ProjectModel; component: ComponentModel } {
  const { project } = openProject(root);
  const c = project.components[0];
  saveComponent(root, { ...c, openapi: ['svc/dist/openapi.json'], openapiGenerate: { command, cwd: 'svc', timeoutSec: 10 }, ...extra });
  const reread = readProject(root)!;
  return { project: reread, component: reread.components[0] };
}

describe('config', () => {
  it('detects generator scripts and the output path', () => {
    const pm = (scripts: Record<string, string>) => detectOpenApiGenerator(root, 'integrations/x', scripts);
    expect(pm({ 'generate:openapi': 'tsx a.ts' })).toEqual({ command: 'pnpm run generate:openapi', spec: 'integrations/x/dist/openapi.json' });
    expect(pm({ openapi: 'x', 'openapi:generate': 'y' })?.command).toBe('pnpm run openapi:generate');
    expect(pm({ swagger: 'swagger-cli' })?.command).toBe('pnpm run swagger');
    expect(pm({ 'docs:generate': 'swagger-jsdoc -d c.ts r/*.ts -o docs/openapi.json' })).toEqual({
      command: 'pnpm run docs:generate',
      spec: 'integrations/x/docs/openapi.json',
    });
    expect(pm({ build: 'tsc && node scripts/openapi.mjs' })?.command).toBe('pnpm run build');
    expect(pm({ build: 'tsc', test: 'vitest' })).toBeUndefined();
    expect(pm({ 'test:openapi': 'vitest' })).toBeUndefined();
  });

  it('prefills command and spec on import and writes the nested YAML', () => {
    const { project } = openProject(root);
    const c = project.components[0];
    expect(c.openapiGenerate).toEqual({ command: 'pnpm run generate:openapi' });
    expect(c.openapi).toEqual(['svc/dist/openapi.json']);
    const raw = yaml.load(fs.readFileSync(path.join(root, c.catalog, COMPONENT_FILES.service), 'utf-8')) as { openapi: { spec: string; generate: { command: string } } };
    expect(raw.openapi).toEqual({ spec: 'svc/dist/openapi.json', generate: { command: 'pnpm run generate:openapi' } });
    expect(readProject(root)!.components[0].openapiGenerate).toEqual({ command: 'pnpm run generate:openapi' });
  });

  it('keeps committed spec lists valid when no command is set', () => {
    const { project } = openProject(root);
    const c = project.components[0];
    saveComponent(root, { ...c, openapi: ['svc/openapi.yaml'], openapiGenerate: undefined });
    const file = path.join(root, c.catalog, COMPONENT_FILES.service);
    expect((yaml.load(fs.readFileSync(file, 'utf-8')) as { openapi: unknown }).openapi).toEqual(['svc/openapi.yaml']);
    // legacy string form
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace(/openapi:\n {2}- svc\/openapi.yaml/, 'openapi: svc/legacy.json'));
    expect(readProject(root)!.components[0]).toMatchObject({ openapi: ['svc/legacy.json'], openapiGenerate: undefined });
  });

  it('validates the config', () => {
    expect(normalizeGenerate({ command: '  ' })).toBeUndefined();
    expect(normalizeGenerate({ command: ' pnpm run x ', timeoutSec: '30' })).toEqual({ command: 'pnpm run x', cwd: undefined, timeoutSec: 30 });
    expect(() => normalizeGenerate({ command: 'a\nb' })).toThrow(/single line/);
    expect(() => normalizeGenerate({ command: 'a', cwd: '../outside' })).toThrow(/inside the project/);
    expect(() => normalizeGenerate({ command: 'a', cwd: '/etc' })).toThrow(/inside the project/);
    expect(() => normalizeGenerate({ command: 'a', timeoutSec: 0 })).toThrow(/timeoutSec/);
    const { project } = openProject(root);
    expect(() => saveComponent(root, { ...project.components[0], openapi: ['../x.json'] })).toThrow(/inside the project/);
  });
});

describe('runner', () => {
  it('runs the command, streams the log and reports operations', async () => {
    const { project, component } = setup('node gen.js');
    const chunks: string[] = [];
    const result = await runOpenApiGenerate(project, component, { onLog: (c) => chunks.push(c) });
    expect(result).toMatchObject({ state: 'ok', exitCode: 0, operations: 3 });
    expect(chunks.join('')).toContain('written');
    expect(result.log).toContain('$ node gen.js');
    expect(fs.existsSync(path.join(root, 'svc/dist/openapi.json'))).toBe(true);
  });

  it('reports a non-zero exit code with the output', async () => {
    const { project, component } = setup('node -e "console.error(\'boom\');process.exit(3)"');
    const result = await runOpenApiGenerate(project, component);
    expect(result).toMatchObject({ state: 'failed', exitCode: 3 });
    expect(result.log).toContain('boom');
  });

  it('fails when the command succeeds but writes no spec', async () => {
    const { project, component } = setup('node -e "0"');
    const result = await runOpenApiGenerate(project, component);
    expect(result.state).toBe('failed');
    expect(result.message).toMatch(/spec was not written/);
  });

  it('fails on an invalid spec', async () => {
    const { project, component } = setup('node -e "require(\'fs\').mkdirSync(\'dist\',{recursive:true});require(\'fs\').writeFileSync(\'dist/openapi.json\',\'{bad\')"');
    const result = await runOpenApiGenerate(project, component);
    expect(result).toMatchObject({ state: 'failed' });
    expect(result.message).toMatch(/not valid/);
  });

  it('kills the process on timeout', async () => {
    const { project, component } = setup('node -e "setTimeout(()=>{},60000)"');
    component.openapiGenerate!.timeoutSec = 1;
    const started = Date.now();
    const result = await runOpenApiGenerate(project, component);
    expect(result.state).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(8000);
  });

  it('can be cancelled', async () => {
    const { project, component } = setup('node -e "setTimeout(()=>{},60000)"');
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    expect((await runOpenApiGenerate(project, component, { signal: controller.signal })).state).toBe('cancelled');
  });

  it('refuses a working directory outside the project and a missing directory', async () => {
    const { project, component } = setup('node gen.js');
    component.openapiGenerate!.cwd = '../';
    expect((await runOpenApiGenerate(project, component)).message).toMatch(/inside the project/);
    component.openapiGenerate!.cwd = 'nope';
    expect((await runOpenApiGenerate(project, component)).message).toMatch(/not found/);
  });

  it('does not interpret anything beyond the configured command', async () => {
    // the component name / paths are never part of the command line
    const { project, component } = setup('node -e "console.log(process.argv.length)"');
    component.name = '$(touch /tmp/pc-injected); `id`';
    const result = await runOpenApiGenerate(project, component);
    expect(result.log).toMatch(/\n1\n/);
    expect(fs.existsSync('/tmp/pc-injected')).toBe(false);
  });
});

describe('manager', () => {
  it('tracks status, blocks parallel runs and generates all', async () => {
    const { project, component } = setup('node gen.js');
    const manager = new OpenApiGenerationManager();
    const events: string[] = [];
    manager.onEvent((e) => events.push(e.type === 'status' ? e.status.state : 'log'));
    expect(manager.status(component.id).state).toBe('idle');
    expect(manager.info(project)[0]).toMatchObject({ canGenerate: true, specs: [{ path: 'svc/dist/openapi.json', exists: false }] });

    const first = manager.generate(project, component);
    await expect(manager.generate(project, component)).rejects.toThrow(/already running/);
    expect((await first).state).toBe('ok');
    expect(events[0]).toBe('running');
    expect(events.at(-1)).toBe('ok');
    const info = manager.info(project)[0];
    expect(info.status.state).toBe('ok');
    expect(info.specs[0]).toMatchObject({ exists: true, operations: 3 });
    expect(info.specs[0].mtime).toBeGreaterThan(0);

    const all = await manager.generateAll(project);
    expect(all.map((r) => r.state)).toEqual(['ok']);
  });
});
