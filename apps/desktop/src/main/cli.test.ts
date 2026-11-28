import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from '@pc/core/project/model';
import { runCli } from './cli';

let root: string;
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function io() {
  const out: string[] = [];
  return { out, io: { log: (l: string) => out.push(l), error: (l: string) => out.push(l), cwd: root } };
}

describe('product-creator migrate', () => {
  it('moves functions/ to features/, dry run first', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cli-'));
    process.env.PC_LOG_DIR = path.join(root, '.logs-outside');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo"}');
    const project = openProject(root).project;
    const legacy = path.join(root, project.components[0].catalog, 'functions', 'orders', 'order.create.yml');
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, 'id: orders.order.create\n');

    const dry = io();
    expect(await runCli(['migrate', '--dry-run'], dry.io)).toBe(0);
    expect(dry.out.join('\n')).toContain('would move 1');
    expect(fs.existsSync(legacy)).toBe(true);

    const run = io();
    expect(await runCli(['migrate', root], run.io)).toBe(0);
    expect(run.out.join('\n')).toContain('moved 1');
    expect(fs.existsSync(path.join(root, project.components[0].catalog, 'features', 'orders', 'order.create.yml'))).toBe(true);
    expect(fs.existsSync(path.join(root, project.components[0].catalog, 'functions'))).toBe(false);
  });

  it('lint reports model errors with exit code 1, also for a bare catalog folder', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cli-'));
    process.env.PC_LOG_DIR = path.join(root, '.logs-outside');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo"}');
    const project = openProject(root).project;
    const wf = path.join(root, project.components[0].catalog, 'workflows', 'orders.checkout.yml');
    fs.mkdirSync(path.dirname(wf), { recursive: true });
    fs.writeFileSync(wf, 'workflow: orders.checkout\nlifecycle: draft\nsteps:\n  - orders.order.create\n');

    const run = io();
    expect(await runCli(['lint'], run.io)).toBe(1);
    expect(run.out.join('\n')).toMatch(/unknown_feature[\s\S]*1 error/);

    const bare = io();
    expect(await runCli(['lint', '--catalog', path.join(root, project.components[0].catalog), '--json'], bare.io)).toBe(1);
    expect(JSON.parse(bare.out.join('\n')).errors).toBe(1);

    fs.unlinkSync(wf);
    expect(await runCli(['lint'], io().io)).toBe(0);
  });

  it('reports usage and missing projects', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cli-'));
    expect(await runCli(['bogus'], io().io)).toBe(2);
    expect(await runCli(['migrate', root], io().io)).toBe(2);
  });
});
