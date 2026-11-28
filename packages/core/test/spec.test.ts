import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectModel } from '../src/project/model';
import type { BusinessObject, Feature, Workflow } from '../src/types';
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
  it('human view: product context, features by context, drafts apart, problems next to the entry and in the list', () => {
    const { files, spec } = generateSpec(project(), model());
    const md = files['spec.md'];
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
    const md = generateSpec(project(), m).files['spec.md'];
    expect(md).toContain('| lines | `order.line[]` — Order line |');
    expect(md).toContain('*implemented* · value object (part of other objects, not stored on its own)');
    expect(md).toContain('**Computed by:** order create (`shop.order.create`)');
    expect(md).toContain('*implemented* · stored entity · Component: API');
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
    expect(files).toContain('spec.md');
    expect(fs.existsSync(path.join(dir, 'agent/features/gone.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'notes.md'), 'utf8')).toBe('mine');

    expect(() => specOutputDir(project({ spec: { output: '.' } }))).toThrow(/inside the project/);
    expect(() => specOutputDir(project({ spec: { output: 'docs/product/api' } }))).toThrow(/catalog/);
    expect(() => specOutputDir(project({ spec: { output: 'docs' } }))).toThrow(/catalog/);
  });
});
