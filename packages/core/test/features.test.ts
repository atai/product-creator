import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, toStorageEntities, PROJECT_FILE, type ProjectModel } from '../src/project/model';
import { configureStorage, getStorage, resetStorage } from '../src/storage';
import { legacyCatalogs, migrateFeatureFolders, migrateProject } from '../src/catalog/migrate';
import { dispatch } from '../src/http/router';
import { validateModel } from '../src/validation/model';

let root: string;
let project: ProjectModel;
let catalog: string;

function write(rel: string, content: string | object) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}
const card = (id: string, name = id) => {
  const [ctx, entity, action] = id.split('.');
  return `id: ${id}\nname: ${name}\nbounded_context: ${ctx}\nentity: ${entity}\naction: ${action}\nowner: team\nlifecycle: implemented\n`;
};

async function load() {
  await resetStorage();
  configureStorage({ manifest: { ...toStorageEntities([project]), source: PROJECT_FILE } });
  return getStorage();
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-features-'));
  process.env.PC_LOG_DIR = path.join(root, '.logs-outside');
  write('package.json', { name: 'demo', private: true });
  project = openProject(root).project;
  catalog = path.join(root, project.components[0].catalog);
});

afterEach(async () => {
  await resetStorage();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('features folder (PRODUCTCREATOR-28)', () => {
  it('reads the old functions/ folder and features/ together', async () => {
    write(path.join(project.components[0].catalog, 'functions/orders/order.create.yml'), card('orders.order.create'));
    write(path.join(project.components[0].catalog, 'features/orders/order.cancel.yml'), card('orders.order.cancel'));
    const storage = await load();
    expect(storage.getAllFeatures().map((f) => f.id).sort()).toEqual(['orders.order.cancel', 'orders.order.create']);
    expect(storage.getFeaturesOfApp(project.components[0].id)).toHaveLength(2);
    expect(storage.getRootForFilePath(storage.getFilePathById('orders.order.create')!)).toBe(catalog);
  });

  it('saving a card from functions/ moves it to features/', async () => {
    write(path.join(project.components[0].catalog, 'functions/orders/order.create.yml'), card('orders.order.create'));
    const storage = await load();
    const feature = storage.getFeatureById('orders.order.create')!;
    const result = await storage.saveFeature({ ...feature, name: 'Create order' }, catalog);
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(catalog, 'features/orders/order.create.yml'))).toBe(true);
    expect(fs.existsSync(path.join(catalog, 'functions/orders/order.create.yml'))).toBe(false);
  });

  it('migrates functions/ to features/ without overwriting', () => {
    write(path.join(project.components[0].catalog, 'functions/orders/order.create.yml'), card('orders.order.create'));
    write(path.join(project.components[0].catalog, 'functions/orders/order.pay.yml'), card('orders.order.pay'));
    write(path.join(project.components[0].catalog, 'features/orders/order.pay.yml'), card('orders.order.pay'));
    write(path.join(project.components[0].catalog, 'functions/orders/order.ship.yml'), card('orders.order.ship', 'Old'));
    write(path.join(project.components[0].catalog, 'features/orders/order.ship.yml'), card('orders.order.ship', 'New'));
    expect(legacyCatalogs(project)).toEqual([{ catalog, files: 3 }]);

    const dry = migrateFeatureFolders(catalog, { dryRun: true });
    expect(dry.moved).toEqual([path.join('features', 'orders', 'order.create.yml')]);
    expect(fs.existsSync(path.join(catalog, 'functions/orders/order.create.yml'))).toBe(true);

    const [result] = migrateProject(project);
    expect(result.moved).toEqual([path.join('features', 'orders', 'order.create.yml')]);
    expect(result.identical).toEqual([path.join('features', 'orders', 'order.pay.yml')]);
    expect(result.conflicts).toEqual([path.join('functions', 'orders', 'order.ship.yml')]);
    expect(fs.readFileSync(path.join(catalog, 'features/orders/order.ship.yml'), 'utf8')).toContain('name: New');
    expect(legacyCatalogs(project)).toEqual([{ catalog, files: 1 }]);

    fs.unlinkSync(path.join(catalog, 'functions/orders/order.ship.yml'));
    expect(migrateProject(project)[0].moved).toEqual([]);
    expect(fs.existsSync(path.join(catalog, 'functions'))).toBe(false);
  });

  it('reports an id defined in functions/ and features/, and recovers when one is removed', async () => {
    const cat = project.components[0].catalog;
    write(path.join(cat, 'functions/orders/order.create.yml'), card('orders.order.create', 'Old'));
    write(path.join(cat, 'features/orders/order.create.yml'), card('orders.order.create', 'New'));
    const storage = await load();
    const dup = validateModel(storage.modelSnapshot()).filter((i) => i.code === 'duplicate_id');
    expect(dup).toHaveLength(1);
    expect(dup[0].message).toContain('2 files');

    const legacy = path.join(catalog, 'functions/orders/order.create.yml');
    await storage.whenWatching();
    fs.unlinkSync(legacy);
    // the file watcher drops the removed file and re-reads the remaining one
    await vi.waitFor(() => expect(validateModel(storage.modelSnapshot()).filter((i) => i.code === 'duplicate_id')).toHaveLength(0), { timeout: 15000 });
    expect(storage.getFeatureById('orders.order.create')?.name).toBe('New');
  }, 20000);
});

describe('feature spec fields in storage (PRODUCTCREATOR-32)', () => {
  const spec = 'actors: [AI agent]\nrequirements:\n  - id: R1\n    text: Check a plan\nacceptance:\n  - id: A1\n    covers: [R1, R9]\n    then: ok is false\nopen_questions:\n  - id: Q1\n    question: Relax ids?\ndecisions:\n  - id: D1\n    decision: Core validates\n    date: 2026-11-28\n';

  it('reads spec fields, validates them and keeps them when the card is saved back', async () => {
    write(path.join(project.components[0].catalog, 'features/orders/order.create.yml'), card('orders.order.create') + spec);
    const storage = await load();
    const feature = storage.getFeatureById('orders.order.create')!;
    expect(feature.requirements).toEqual([{ id: 'R1', text: 'Check a plan' }]);
    expect(feature.open_questions?.[0].question).toBe('Relax ids?');
    expect(validateModel(storage.modelSnapshot()).map((i) => i.code)).toEqual(['unknown_requirement']);

    await storage.saveFeature({ ...feature, name: 'Create order' }, catalog);
    const saved = fs.readFileSync(path.join(catalog, 'features/orders/order.create.yml'), 'utf8');
    expect(saved).toContain('requirements:');
    expect(saved).toContain('covers:');
    expect(storage.getFeatureById('orders.order.create')?.actors).toEqual(['AI agent']);
    // a YAML date stays a YYYY-MM-DD string through read and save (no Date / ISO timestamp)
    expect(storage.getFeatureById('orders.order.create')?.decisions?.[0].date).toBe('2026-11-28');
    expect(saved).not.toContain('T00:00:00');
  });
});

describe('file watcher', () => {
  it('picks up files written outside the app, also in a features/ folder created later', async () => {
    write(path.join(project.components[0].catalog, 'functions/orders/order.create.yml'), card('orders.order.create'));
    const storage = await load();
    await storage.whenWatching();
    write(path.join(project.components[0].catalog, 'features/orders/order.pay.yml'), card('orders.order.pay'));
    write(path.join(project.components[0].catalog, 'notes/readme.yml'), card('orders.order.noise'));
    await vi.waitFor(() => expect(storage.getFeatureById('orders.order.pay')).not.toBeNull(), { timeout: 15000 });
    expect(storage.getFeatureById('orders.order.noise')).toBeNull();
  }, 20000);
});

describe('save guard (PRODUCTCREATOR-29)', () => {
  const post = (url: string, body: unknown) =>
    dispatch(new Request(`http://pc.local${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

  it('rejects writes that add errors, accepts consistent ones, keeps existing problems editable', async () => {
    const cat = project.components[0].catalog;
    write(path.join(cat, 'features/legacy/thing.do.yml'), card('legacy.thing.do') + 'calls:\n  - gone.x.y\n');
    await load();
    const appId = project.components[0].id;

    const wf = await post('/api/save-workflow', { workflow: { workflow: 'orders.checkout', steps: ['orders.order.create'] }, appId });
    expect(wf.status).toBe(400);
    const body = (await wf.json()) as { issues: { code: string }[] };
    expect(body.issues[0].code).toBe('unknown_feature');

    const feature = { id: 'orders.order.create', name: 'Create order', bounded_context: 'orders', entity: 'order', action: 'create', owner: 'team', lifecycle: 'implemented', objects: [{ id: 'order', access: 'write' }] };
    const missingObject = await post('/api/save-feature', { data: feature, appId });
    expect(missingObject.status).toBe(400);
    expect(await missingObject.text()).toContain('unknown_object');

    const bo = await post('/api/save-business-object', { businessObject: { id: 'order', name: 'Order', owner: 'team', lifecycle: 'implemented', fields: [{ name: 'id', type: 'string' }] }, appId });
    expect(bo.status).toBe(200);
    expect((await post('/api/save-feature', { data: feature, appId })).status).toBe(201);
    expect((await post('/api/save-workflow', { workflow: { workflow: 'orders.checkout', steps: ['orders.order.create'] }, appId })).status).toBe(200);

    const plan = await post('/api/validate-plan', { changes: [{ kind: 'function', op: 'delete', id: 'orders.order.create' }] });
    const planBody = (await plan.json()) as { ok: boolean; introduced: { id: string }[] };
    expect(planBody.ok).toBe(false);
    expect(planBody.introduced.map((i) => i.id)).toContain('orders.checkout');

    // an entry with an old problem can still be saved (the problem is not new)
    const legacy = { ...feature, id: 'legacy.thing.do', bounded_context: 'legacy', entity: 'thing', action: 'do', objects: undefined, calls: ['gone.x.y'], name: 'Renamed' };
    expect((await post('/api/save-feature', { data: legacy, appId })).status).toBe(200);

    const impact = await dispatch(new Request('http://pc.local/api/impact?kind=business_object&id=order'));
    const impactBody = (await impact.json()) as { features: { id: string }[]; workflows: { id: string }[] };
    expect(impactBody.features.map((f) => f.id)).toEqual(['orders.order.create']);
    expect(impactBody.workflows.map((w) => w.id)).toEqual(['orders.checkout']);

    const validation = (await (await dispatch(new Request(`http://pc.local/api/validation?app=${appId}`))).json()) as { errors: number };
    expect(validation.errors).toBe(1);
  });
});

