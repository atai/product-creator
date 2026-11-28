import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectModel } from '../src/project/model';
import type { BusinessObject, Feature, Stream, Workflow } from '../src/types';
import type { CatalogModel } from '../src/validation/model';
import { generateSpec, specOutputDir, writeSpec } from '../src/spec/index';
import { messagesFor } from '../src/spec/messages';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-spec-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const project = (extra: Partial<ProjectModel> = {}): ProjectModel => ({
  id: 'p1',
  slug: 'shop',
  name: 'Shop',
  catalogRoot: 'docs/product',
  root,
  components: [{ id: 'c1', slug: 'api', name: 'API', kind: 'service', path: 'api', catalog: 'docs/product/api' }],
  vision: 'Sell things',
  goals: [{ id: 'G1', text: 'Checkout in one minute' }],
  actors: [{ id: 'buyer', name: 'Buyer' }],
  tracker: { issueUrl: 'https://t.example/issue/{id}' },
  ...extra,
});

const feature = (id: string, extra: Partial<Feature> = {}): Feature => {
  const [bounded_context, entity, action] = id.split('.');
  return { id, name: `${entity} ${action}`, bounded_context, entity, action, owner: 'team-x', lifecycle: 'implemented', ...extra };
};

function model(): CatalogModel {
  const order: BusinessObject = { id: 'order', name: 'Order', owner: 'team-x', lifecycle: 'implemented', fields: [{ name: 'total', type: 'decimal', description: 'Sum' }] };
  const checkout: Workflow = { workflow: 'shop.checkout', name: 'Checkout', lifecycle: 'approved', steps: ['shop.order.create'] };
  return {
    features: [
      {
        data: feature('shop.order.create', {
          actors: ['buyer'],
          tickets: ['SHOP-1'],
          source_file: 'orders.ts',
          objects: [{ id: 'order', access: 'write' }],
          requirements: [{ id: 'R1', text: 'A buyer creates an order' }],
          acceptance: [{ id: 'A1', covers: ['R1'], given: 'a cart', when: 'the buyer pays', then: 'an order exists', verify: 'pnpm test -- orders' }],
        }),
        component: 'c1',
      },
      { data: feature('shop.order.refund', { lifecycle: 'draft', calls: ['shop.order.missing'], open_questions: [{ id: 'Q1', question: 'Partial refunds?' }] }), component: 'c1' },
      { data: feature('shop.order.legacy', { lifecycle: 'removed' }), component: 'c1' },
      { data: feature('other.thing.do'), component: 'elsewhere' },
    ],
    workflows: [{ data: checkout, component: 'c1' }],
    objects: [{ data: order, component: 'c1' }],
  };
}

describe('spec generation (PRODUCTCREATOR-35)', () => {
  it('streams and external systems: a section for people, a chunk for agents, translated (PRODUCTCREATOR-43)', () => {
    const delivery: Stream = {
      stream: 'shop.delivery',
      name: 'From order to delivery',
      goal: 'Orders arrive on time',
      lifecycle: 'draft',
      kpis: [{ id: 'K1', name: 'Delivered on time', target: '95%' }],
      stages: [
        { id: 'ST1', name: 'Ordered', entry_events: ['cart.ready'], exit_events: ['order.created'], features: ['shop.order.create'], workflows: ['shop.checkout'] },
        { id: 'ST2', name: 'Shipped', entry_events: ['order.created'], exit_events: ['parcel.delivered'], performed_by: ['carrier'] },
      ],
      i18n: { ru: { name: 'От заказа до доставки', stages: { ST2: { name: 'Отправлен' } } } },
    };
    const removed: Stream = { ...delivery, stream: 'shop.old', name: 'Old', lifecycle: 'removed' };
    const m = { ...model(), streams: [{ data: delivery, component: 'c1' }, { data: removed, component: 'c1' }] };
    const p = project({ languages: ['en', 'ru'], systems: [{ id: 'carrier', name: 'Carrier', emits: ['parcel.delivered'], consumes: ['order.created'] }] });
    const { files } = generateSpec(p, m);
    const en = files['en/spec.md'];
    expect(en).toContain('### External systems');
    expect(en).toMatch(/\| Carrier \| {2}\| `parcel.delivered` \| `order.created` \|/);
    expect(en).toContain('## 5. Streams');
    expect(en).toContain('### From order to delivery (`shop.delivery`)');
    expect(en).toContain('**K1** Delivered on time (target: 95%)');
    expect(en).toMatch(/\| \*\*ST1\*\* Ordered \| `cart.ready` \| `order.created` \| order create \(`shop.order.create`\), Checkout \(`shop.checkout`\) \| {2}\|/);
    expect(en).toContain('| **ST2** Shipped | `order.created` | `parcel.delivered` |  | Carrier |');
    expect(en).not.toContain('shop.old');
    const ru = files['ru/spec.md'];
    expect(ru).toContain('## 5. Потоки');
    expect(ru).toContain('### От заказа до доставки (`shop.delivery`)');
    expect(ru).toContain('**ST2** Отправлен');
    const chunk = JSON.parse(files['agent/streams/shop.delivery.json']);
    expect(chunk.stream.stages[1].performed_by).toEqual([expect.objectContaining({ kind: 'system', id: 'carrier', emits: ['parcel.delivered'] })]);
    expect(chunk.stream.stages[0].features[0]).toMatchObject({ id: 'shop.order.create', lifecycle: 'implemented' });
    const manifest = JSON.parse(files['agent/manifest.json']);
    expect(manifest.entries).toContainEqual(expect.objectContaining({ kind: 'stream', id: 'shop.delivery', file: 'streams/shop.delivery.json' }));
    expect(manifest.counts.streams).toBe(1);
  });

  it('human view: product context, features by context, drafts apart, problems next to the entry and in the list', () => {
    const { files, spec } = generateSpec(project(), model());
    const md = files['en/spec.md'];
    expect(md).toMatch(/^# Shop: Specification/);
    expect(md).toContain('**Not ready:** the model has 1 error(s)');
    expect(md).toContain('- **G1** Checkout in one minute');
    expect(md).toContain('**Actors:** Buyer');
    expect(md).toContain('[SHOP-1](https://t.example/issue/SHOP-1)');
    expect(md).toContain('**Given** a cart; **When** the buyer pays; **Then** an order exists');
    // agent-only fields stay out of the human view
    expect(md).not.toContain('pnpm test -- orders');
    expect(md).not.toContain('orders.ts');
    // drafts come after the agreed features, removed and foreign entries are left out
    expect(md.indexOf('## 5. Drafts')).toBeLessThan(md.indexOf('shop.order.refund'));
    expect(md).not.toContain('shop.order.legacy');
    expect(md).not.toContain('other.thing.do');
    expect(md).toContain('> - **error**: Calls unknown feature "shop.order.missing" (`calls[0]`)');
    expect(spec.counts.errors).toBe(1);
  });

  it('agent view: manifest with entries and issues, chunks with agent fields and resolved objects', () => {
    const { files } = generateSpec(project(), model());
    const manifest = JSON.parse(files['agent/manifest.json']);
    expect(manifest).toMatchObject({ format: 'product-creator.spec/1', ready: false, language: 'en', counts: { errors: 1, features: 2, objects: 1, workflows: 1 } });
    const entry = manifest.entries.find((e: { id: string }) => e.id === 'shop.order.create');
    const chunk = JSON.parse(files[`agent/${entry.file}`]);
    expect(chunk.feature.acceptance[0].verify).toBe('pnpm test -- orders');
    expect(chunk.feature.source_file).toBe('orders.ts');
    expect(chunk.feature.owner).toBeUndefined();
    expect(chunk.objects[0]).toMatchObject({ id: 'order', access: 'write', fields: [{ name: 'total', type: 'decimal', description: 'Sum' }] });
    expect(chunk.workflows).toEqual(['shop.checkout']);
    const refund = JSON.parse(files['agent/features/shop.order.refund.json']);
    expect(refund.issues.map((i: { code: string }) => i.code)).toEqual(['unknown_feature']);
  });

  it('data section shows object kinds, computed by and the names of value object types (PRODUCTCREATOR-39)', () => {
    const m = model();
    m.objects.push({ data: { id: 'order.line', name: 'Order line', owner: 'team-x', lifecycle: 'implemented', kind: 'value', fields: [{ name: 'qty', type: 'int' }] }, component: 'c1' });
    m.objects.push({ data: { id: 'order_total', name: 'Order total', owner: 'team-x', lifecycle: 'implemented', kind: 'computed', computedBy: ['shop.order.create'], fields: [{ name: 'sum', type: 'decimal' }] }, component: 'c1' });
    m.objects[0] = { ...m.objects[0], data: { ...m.objects[0].data, fields: [...m.objects[0].data.fields, { name: 'lines', type: 'order.line[]' }] } };
    const md = generateSpec(project(), m).files['en/spec.md'];
    expect(md).toContain('| lines | `order.line[]` — Order line |');
    expect(md).toContain('*implemented* · value object (part of other objects, not stored on its own)');
    expect(md).toContain('**Computed by:** order create (`shop.order.create`)');
    expect(md).toContain('*implemented* · stored entity · Component: API');
  });

  it('a human spec per project language: translated texts, untranslated ones marked, labels of the language (PRODUCTCREATOR-37)', () => {
    const m = model();
    const create = m.features[0].data;
    m.features[0] = { ...m.features[0], data: { ...create, i18n: { ru: { name: 'Создать заказ', requirements: { R1: { text: 'Покупатель создаёт заказ' } } } }, screens: [{ id: 'S1', title: 'Order form', path: '/orders/new' }] } };
    fs.mkdirSync(path.join(root, 'docs/spec/screens/ru/shop.order.create'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/spec/screens/ru/shop.order.create/S1.png'), 'png');
    const p = project({ languages: ['en', 'ru', 'de'], i18n: { ru: { vision: 'Продавать' } } });
    const { files, languages } = generateSpec(p, m);
    expect(Object.keys(files).filter((f) => f.endsWith('spec.md')).sort()).toEqual(['de/spec.md', 'en/spec.md', 'ru/spec.md']);
    const ru = files['ru/spec.md'];
    expect(ru).toMatch(/^# Shop: Техническое задание/);
    expect(ru).toContain('#### Создать заказ (`shop.order.create`)');
    expect(ru).toContain('- **R1** Покупатель создаёт заказ');
    expect(ru).toContain('### Видение\n\nПродавать');
    expect(ru).toContain('order refund [EN]'); // not translated: primary text, marked
    expect(ru).toContain('](../screens/ru/shop.order.create/S1.png)'); // screenshot of its language
    expect(ru).toMatch(/текст\(ов\) ещё не переведены/);
    expect(files['de/spec.md']).toMatch(/^# Shop: Spezifikation/);
    expect(files['en/spec.md']).not.toContain('[EN]');
    expect(languages.find((l) => l.language === 'en')?.untranslated).toBe(0);
    expect(languages.find((l) => l.language === 'ru')?.untranslated).toBeGreaterThan(0);
  });

  it('labels follow spec.language and fall back to English when there is no catalog for it', () => {
    expect(messagesFor('en-GB')).toMatchObject({ language: 'en', fallback: false });
    expect(messagesFor('xx')).toMatchObject({ language: 'en', fallback: true });
    const generated = generateSpec(project({ spec: { language: 'xx' } }), model());
    expect(generated).toMatchObject({ labelsLanguage: 'en', labelsFallback: true });
    expect(JSON.parse(generated.files['agent/manifest.json'])).toMatchObject({ language: 'xx', labels: { language: 'en', fallback: true } });
  });

  it('writes to spec.output, replaces stale chunks, keeps other files, refuses unsafe folders', () => {
    const p = project();
    const dir = specOutputDir(p);
    expect(dir).toBe(path.join(root, 'docs/spec'));
    fs.mkdirSync(path.join(dir, 'agent/features'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'agent/features/gone.json'), '{}');
    fs.writeFileSync(path.join(dir, 'notes.md'), 'mine');
    const { files } = writeSpec(p, generateSpec(p, model()));
    expect(files).toContain('en/spec.md');
    expect(fs.existsSync(path.join(dir, 'agent/features/gone.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'notes.md'), 'utf8')).toBe('mine');

    expect(() => specOutputDir(project({ spec: { output: '.' } }))).toThrow(/inside the project/);
    expect(() => specOutputDir(project({ spec: { output: 'docs/product/api' } }))).toThrow(/catalog/);
    expect(() => specOutputDir(project({ spec: { output: 'docs' } }))).toThrow(/catalog/);
  });
});
