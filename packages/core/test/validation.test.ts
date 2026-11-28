import { describe, expect, it } from 'vitest';
import type { BusinessObject, Feature, Workflow } from '../src/types';
import { referencedType, validateModel, type CatalogModel } from '../src/validation/model';
import { findDuplicates, impactOf, planIssues } from '../src/validation/plan';

const feature = (id: string, extra: Partial<Feature> = {}): Feature => {
  const [bounded_context, entity, action] = id.split('.');
  return { id, name: `${entity} ${action}`, bounded_context, entity, action, owner: 'team', lifecycle: 'implemented', ...extra };
};
const object = (id: string, fields: BusinessObject['fields'] = [{ name: 'id', type: 'string' }], name = id): BusinessObject => ({ id, name, owner: 'team', lifecycle: 'implemented', fields });
const workflow = (key: string, steps: string[], compensations?: Record<string, string>): Workflow => ({ workflow: key, name: key, lifecycle: 'implemented', steps, ...(compensations ? { compensations } : {}) });

function model(): CatalogModel {
  return {
    features: [
      { data: feature('orders.order.create', { objects: [{ id: 'order', access: 'write' }, { id: 'customer', access: 'read' }] }), component: 'svc', file: '/c/features/orders/order.create.yml' },
      { data: feature('orders.order.cancel', { calls: ['orders.order.create'] }), component: 'svc' },
      { data: feature('billing.invoice.create', { objects: [{ id: 'order', access: 'read' }] }), component: 'svc' },
    ],
    workflows: [{ data: workflow('orders.checkout', ['orders.order.create', 'billing.invoice.create'], { 'orders.order.create': 'orders.order.cancel' }), component: 'svc' }],
    objects: [
      { data: object('order', [{ name: 'id', type: 'string' }, { name: 'customer', type: 'Customer?' }, { name: 'lines', type: 'order_line[]' }]), component: 'svc' },
      { data: object('customer', [{ name: 'id', type: 'uuid' }], 'Customer'), component: 'svc' },
      { data: object('order.line', [{ name: 'amount', type: 'decimal(10,2)' }]), component: 'svc' },
    ],
  };
}

describe('feature spec fields (PRODUCTCREATOR-32)', () => {
  const spec: Partial<Feature> = {
    actors: ['project owner', 'AI agent'],
    requirements: [
      { id: 'R1', text: 'The agent can check a plan without writing', priority: 'must' },
      { id: 'R2', text: 'Errors name the field and how to fix it' },
    ],
    acceptance: [
      { id: 'A1', covers: ['R1'], given: 'a plan with an unknown object', when: 'validate_plan runs', then: 'ok is false and nothing is written', verify: 'pnpm --filter @pc/mcp test' },
      { id: 'A2', covers: ['R2'], text: 'Every issue has field and message' },
    ],
    constraints: [{ id: 'C1', kind: 'performance', text: 'A plan of 50 changes is checked in < 1 s' }],
    decisions: [{ id: 'D1', decision: 'Validation lives in core', reason: 'One check for UI, MCP and CLI', date: '2026-11-28' }],
    open_questions: [{ id: 'Q1', question: 'Relax the id pattern?', owner: 'atai' }],
  };

  it('a complete spec is valid', () => {
    const m = model();
    m.features[0] = { ...m.features[0], data: { ...m.features[0].data, ...spec } };
    expect(validateModel(m)).toEqual([]);
  });

  it('reports bad item ids, duplicates, unknown requirements and criteria without a result', () => {
    const m = model();
    const bad = {
      ...spec,
      requirements: [{ id: 'R1', text: 'a' }, { id: 'R1', text: 'b' }, { id: 'req-3', text: 'c' }],
      acceptance: [{ id: 'A1', covers: ['R9'], given: 'g', when: 'w' }],
    } as Partial<Feature>;
    m.features[0] = { ...m.features[0], data: { ...m.features[0].data, ...bad } };
    const codes = validateModel(m).map((i) => `${i.code}:${i.field ?? ''}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        'duplicate_item_id:requirements[1].id',
        'schema:requirements.2.id',
        'unknown_requirement:acceptance[0].covers[0]',
        'schema:acceptance.0',
      ])
    );
  });
});

describe('validateModel (PRODUCTCREATOR-29)', () => {
  it('a consistent catalog has no issues', () => {
    expect(validateModel(model())).toEqual([]);
  });

  it('reports unknown references, types, ids and duplicates', () => {
    const m = model();
    m.features.push({ data: feature('orders.order.ship', { calls: ['orders.order.pack'], objects: [{ id: 'parcel', access: 'write' }] }), component: 'svc' });
    m.features.push({ data: { ...feature('Orders.order.bad'), bounded_context: 'orders' }, component: 'svc' });
    m.features.push({ data: feature('orders.order.create'), component: 'web' });
    m.workflows.push({ data: workflow('orders.return', ['orders.order.refund'], { 'orders.order.create': 'orders.order.undo' }), component: 'svc' });
    m.objects.push({ data: object('parcel2', [{ name: 'carrier', type: 'Carrier' }, { name: 'status', type: 'enum<new|sent>' }]), component: 'svc' });
    m.objects.push({ data: object('client', [{ name: 'id', type: 'string' }], 'Customer'), component: 'svc' });
    const codes = validateModel(m).map((i) => `${i.severity}:${i.code}:${i.id}:${i.field ?? ''}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        'error:unknown_feature:orders.order.ship:calls[0]',
        'error:unknown_object:orders.order.ship:objects[0].id',
        'error:id_pattern:Orders.order.bad:id',
        'error:id_mismatch:Orders.order.bad:id',
        'error:duplicate_id:orders.order.create:',
        'error:unknown_feature:orders.return:steps[0]',
        'error:unknown_feature:orders.return:compensations.orders.order.create',
        'warning:compensation_not_in_steps:orders.return:compensations.orders.order.create',
        'error:unknown_type:parcel2:fields.carrier.type',
        'warning:duplicate_name:client:name',
        'warning:duplicate_name:customer:name',
      ])
    );
    expect(codes.some((c) => c.includes('fields.status'))).toBe(false);
  });

  it('applies the schemas (business object additionalProperties, workflow steps)', () => {
    const m = model();
    m.objects.push({ data: { ...object('x'), color: 'red' } as BusinessObject, component: 'svc' });
    m.workflows.push({ data: workflow('orders.empty', []), component: 'svc' });
    const issues = validateModel(m).filter((i) => i.code === 'schema');
    expect(issues.map((i) => i.id).sort()).toEqual(['orders.empty', 'x']);
  });

  it('treats scalars, parameters and optional/list suffixes as scalars', () => {
    for (const t of ['string', 'String?', 'varchar(255)', 'double precision', 'DateTime', 'Json', 'int[]', 'enum<a|b>']) expect(referencedType(t)).toBeNull();
    expect(referencedType('Budget[]')).toBe('Budget');
  });

  it('reports duplicate files of one id', () => {
    const m = model();
    m.duplicates = [{ kind: 'feature', id: 'orders.order.create', files: ['/c/functions/a.yml', '/c/features/a.yml'] }];
    expect(validateModel(m).filter((i) => i.code === 'duplicate_id')).toHaveLength(1);
  });
});

describe('plan checks', () => {
  it('returns only the errors a change adds', () => {
    const m = model();
    m.features.push({ data: feature('legacy.thing.do', { calls: ['gone.x.y'] }), component: 'svc' });
    const ok = planIssues(m, [{ kind: 'feature', data: { ...feature('legacy.thing.do', { calls: ['gone.x.y'] }), name: 'Renamed' }, component: 'svc' }]);
    expect(ok.ok).toBe(true);
    expect(ok.existing.map((i) => i.code)).toEqual(['unknown_feature']);

    const bad = planIssues(m, [{ kind: 'workflow', data: workflow('orders.refund', ['orders.order.refund']), component: 'svc' }]);
    expect(bad.ok).toBe(false);
    expect(bad.introduced[0]).toMatchObject({ code: 'unknown_feature', field: 'steps[0]' });

    const both = planIssues(m, [
      { kind: 'feature', data: feature('orders.order.refund'), component: 'svc' },
      { kind: 'workflow', data: workflow('orders.refund', ['orders.order.refund']), component: 'svc' },
    ]);
    expect(both.ok).toBe(true);
  });

  it('deleting a feature breaks the workflows and callers that use it', () => {
    const plan = planIssues(model(), [{ kind: 'feature', op: 'delete', id: 'orders.order.create' }]);
    expect(plan.ok).toBe(false);
    expect(plan.introduced.map((i) => `${i.kind}:${i.id}:${i.field}`).sort()).toEqual([
      'feature:orders.order.cancel:calls[0]',
      'workflow:orders.checkout:compensations.orders.order.create',
      'workflow:orders.checkout:steps[0]',
    ]);
  });

  it('impact of a business object: features, callers, workflows and referencing objects', () => {
    const impact = impactOf(model(), 'business_object', 'customer');
    expect(impact.exists).toBe(true);
    expect(impact.features.map((f) => `${f.id} (${f.via})`)).toEqual(['orders.order.create (objects: read)', 'orders.order.cancel (calls orders.order.create)']);
    expect(impact.workflows.map((w) => w.id)).toEqual(['orders.checkout']);
    expect(impact.objects.map((o) => `${o.id} (${o.via})`)).toEqual(['order (fields: customer)']);
  });

  it('impact of a feature: workflows, callers, calls and objects', () => {
    const impact = impactOf(model(), 'feature', 'orders.order.create');
    expect(impact.features.map((f) => f.id)).toEqual(['orders.order.cancel']);
    expect(impact.workflows[0].via).toContain('steps[0]');
    expect(impact.objects.map((o) => `${o.id}:${o.via}`)).toEqual(['order:objects: write', 'customer:objects: read']);
  });

  it('finds what a proposed name or id would duplicate', () => {
    const r = findDuplicates(model(), { kind: 'feature', name: 'Order Create', id: 'sales.order.create' });
    expect(r.matches.map((m) => `${m.id}:${m.via}`)).toEqual(['orders.order.create:same entity.action, same name']);
    expect(findDuplicates(model(), { kind: 'business_object', name: 'customer' }).matches.map((m) => m.id)).toEqual(['customer']);
  });
});
