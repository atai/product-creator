import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject, toStorageEntities, PROJECT_FILE, type ProjectModel } from '../src/project/model';
import { configureStorage, getStorage, resetStorage } from '../src/storage';
import { legacyCatalogs, migrateFeatureFolders, migrateProject } from '../src/catalog/migrate';

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
  return `id: ${id}\nname: ${name}\nbounded_context: ${ctx}\nentity: ${entity}\naction: ${action}\nowner: team\nlifecycle: active\n`;
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
});
