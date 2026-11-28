import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectModel, ScreenshotSettings } from '../src/project/model';
import { readScreenshotSettings } from '../src/project/model';
import type { Feature } from '../src/types';
import type { CatalogModel } from '../src/validation/model';
import { captureScreens, screensRequest } from '../src/screens/index';
import { generateSpec } from '../src/spec/index';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-screens-'));
  fs.writeFileSync(path.join(root, 'capture.js'), CAPTURER_JS);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const node = (code: string) => `node -e ${JSON.stringify(code)}`;
/** Appends a line to steps.log in the project root */
const mark = (step: string) => node(`require('fs').appendFileSync('steps.log', '${step}\\n')`);

/** A capturer that follows the contract: reads the request, writes a PNG per screen except S2, writes screens.json */
const CAPTURER_JS = `
const fs = require('fs'), path = require('path');
const req = JSON.parse(fs.readFileSync(process.env.PC_SCREENS_REQUEST, 'utf8'));
fs.appendFileSync('steps.log', 'capture ' + process.env.PC_BASE_URL + ' ' + req.screens.length + '\\n');
const screens = req.screens.map((s) => {
  if (s.id === 'S2') return { feature: s.feature, id: s.id, ok: false, error: 'selector not found' };
  const file = path.join(req.output, s.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from('89504e470d0a1a0a', 'hex'));
  return { feature: s.feature, id: s.id, file: s.file, ok: true };
});
fs.writeFileSync(path.join(req.output, 'screens.json'), JSON.stringify({ screens }));
`;
const CAPTURER = 'node capture.js';

const feature = (id: string, extra: Partial<Feature> = {}): Feature => {
  const [bounded_context, entity, action] = id.split('.');
  return { id, name: `${entity} ${action}`, bounded_context, entity, action, owner: 't', lifecycle: 'implemented', ...extra };
};

function model(): CatalogModel {
  return {
    features: [
      { data: feature('shop.order.create', { screens: [{ id: 'S1', title: 'Order form', path: '/orders/new', wait: 'form' }] }), component: 'c1' },
      { data: feature('shop.order.pay', { screens: [{ id: 'S1', title: 'Payment', path: '/pay' }, { id: 'S2', title: 'Receipt', path: '/receipt' }] }), component: 'c1' },
      { data: feature('shop.order.old', { lifecycle: 'removed', screens: [{ id: 'S1', title: 'Old', path: '/old' }] }), component: 'c1' },
    ],
    workflows: [],
    objects: [],
  };
}

const project = (screenshots?: ScreenshotSettings): ProjectModel => ({
  id: 'p1',
  slug: 'shop',
  name: 'Shop',
  catalogRoot: 'docs/product',
  root,
  components: [{ id: 'c1', slug: 'web', name: 'Web', kind: 'service', path: 'web', catalog: 'docs/product/web' }],
  screenshots,
});

const steps = () => fs.readFileSync(path.join(root, 'steps.log'), 'utf8').trim().split('\n');
const out = () => path.join(root, 'docs/spec/screens');

describe('screenshot settings (PRODUCTCREATOR-36)', () => {
  it('reads commands as strings or objects; no capture command = not configured', () => {
    expect(readScreenshotSettings({ setup: 'pnpm seed' })).toBeUndefined();
    expect(readScreenshotSettings({ baseUrl: 'http://localhost:3000', setup: 'pnpm seed', start: [{ command: 'pnpm dev', readyUrl: 'http://localhost:3000' }], capture: 'pnpm e2e:screens', teardown: [{ command: 'pnpm stop', timeoutSec: 10 }] })).toEqual({
      baseUrl: 'http://localhost:3000',
      setup: [{ command: 'pnpm seed' }],
      start: [{ command: 'pnpm dev', readyUrl: 'http://localhost:3000' }],
      capture: { command: 'pnpm e2e:screens' },
      teardown: [{ command: 'pnpm stop', timeoutSec: 10 }],
    });
  });
});

describe('capture (PRODUCTCREATOR-36)', () => {
  it('request lists the screens of live features with their image paths', () => {
    const request = screensRequest(project(), model());
    expect(request.screens.map((s) => `${s.feature}#${s.id}:${s.file}`)).toEqual(['shop.order.create#S1:shop.order.create/S1.png', 'shop.order.pay#S1:shop.order.pay/S1.png', 'shop.order.pay#S2:shop.order.pay/S2.png']);
    expect(request.screens[0]).toMatchObject({ path: '/orders/new', wait: 'form' });
  });

  it('runs setup → start (until ready) → capture → teardown, removes stale images, the spec embeds the images', async () => {
    const port = 40000 + Math.floor(Math.random() * 20000);
    fs.mkdirSync(path.join(out(), 'shop.order.gone'), { recursive: true });
    fs.writeFileSync(path.join(out(), 'shop.order.gone/S1.png'), 'old');
    const p = project({
      baseUrl: `http://127.0.0.1:${port}`,
      setup: [{ command: mark('setup') }],
      start: [{ command: node(`require('fs').appendFileSync('steps.log','start\\n'); require('http').createServer((q,r)=>r.end('ok')).listen(${port})`), readyUrl: `http://127.0.0.1:${port}/`, readyTimeoutSec: 20 }],
      capture: { command: CAPTURER },
      teardown: [{ command: mark('teardown') }],
    });
    const report = await captureScreens(p, model());
    expect(report).toMatchObject({ state: 'ok', requested: 3, captured: 2, failed: [{ feature: 'shop.order.pay', id: 'S2', error: 'selector not found' }] });
    expect(steps()).toEqual(['setup', 'start', `capture http://127.0.0.1:${port} 3`, 'teardown']);
    expect(fs.existsSync(path.join(out(), 'shop.order.gone'))).toBe(false);
    expect(fs.existsSync(path.join(out(), 'screens.request.json'))).toBe(false);
    // the background server was stopped
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();

    const { files, spec } = generateSpec(p, model());
    const md = files['en/spec.md'];
    expect(md).toContain('![S1 — Order form](../screens/shop.order.create/S1.png)');
    expect(md).toContain('S2 — Receipt: no screenshot yet');
    expect(spec.issues.filter((i) => i.code.startsWith('screen_')).map((i) => `${i.code}:${i.id}:${i.field}`)).toEqual(['screen_failed:shop.order.pay:screens.S2']);
    const chunk = JSON.parse(files['agent/features/shop.order.create.json']);
    expect(chunk.screenshots).toEqual([{ id: 'S1', title: 'Order form', path: '/orders/new', file: 'screens/shop.order.create/S1.png', exists: true }]);
  }, 40000);

  it('screenshots.perLanguage captures once per project language into screens/<lang> (PRODUCTCREATOR-37)', async () => {
    const p = { ...project({ capture: { command: CAPTURER }, perLanguage: true }), languages: ['en', 'ru'] };
    const report = await captureScreens(p, model());
    expect(report.state).toBe('ok');
    expect(steps()).toEqual(['capture undefined 3', 'capture undefined 3']);
    expect(fs.existsSync(path.join(out(), 'shop.order.create/S1.png'))).toBe(true);
    expect(fs.existsSync(path.join(out(), 'ru/shop.order.create/S1.png'))).toBe(true);
    const ru = generateSpec(p, model()).files['ru/spec.md'];
    expect(ru).toContain('](../screens/ru/shop.order.create/S1.png)');
  }, 30000);

  it('a failing capture still runs teardown; nothing captured = missing screens in the spec', async () => {
    const p = project({ capture: { command: node('process.exit(3)') }, teardown: [{ command: mark('teardown') }] });
    const report = await captureScreens(p, model());
    expect(report.state).toBe('failed');
    expect(report.message).toContain('exited with code 3');
    expect(steps()).toEqual(['teardown']);
    const { spec } = generateSpec(p, model());
    expect(spec.issues.filter((i) => i.code === 'screen_missing')).toHaveLength(3);
  }, 20000);

  it('cancel stops the run and still tears down', async () => {
    const controller = new AbortController();
    const p = project({ capture: { command: node('setTimeout(() => {}, 60000)') }, teardown: [{ command: mark('teardown') }] });
    setTimeout(() => controller.abort(), 500);
    const report = await captureScreens(p, model(), { signal: controller.signal });
    expect(report.state).toBe('cancelled');
    expect(steps()).toEqual(['teardown']);
  }, 20000);

  it('skips without settings or declared screens', async () => {
    expect((await captureScreens(project(), model())).state).toBe('skipped');
    expect((await captureScreens(project({ capture: { command: 'true' } }), { features: [], workflows: [], objects: [] })).state).toBe('skipped');
  });
});
