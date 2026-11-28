import { describe, expect, it } from 'vitest';
import type { ChecksSettings, ProjectModel } from '../src/project/model';
import type { BusinessObject, Feature, Stream, Workflow } from '../src/types';
import { validateModel, type CatalogModel, type ValidationIssue } from '../src/validation/model';
import { cycles, operationKey } from '../src/validation/design';
import { planIssues } from '../src/validation/plan';

const feature = (id: string, component: string, extra: Partial<Feature> = {}) => {
  const [bounded_context, entity, action] = id.split('.');
  return { data: { id, name: id, bounded_context, entity, action, owner: 't', lifecycle: 'draft', ...extra } as Feature, component, file: `/repo/${id}.yml` };
};
const object = (id: string, extra: Partial<BusinessObject> = {}) => ({ data: { id, name: id, owner: 't', lifecycle: 'draft', fields: [{ name: 'id', type: 'string' }], ...extra } as BusinessObject, component: 'core' });
const workflow = (key: string, steps: string[], extra: Partial<Workflow> = {}) => ({ data: { workflow: key, lifecycle: 'draft', steps, ...extra } as Workflow, component: 'core' });

function project(checks?: ChecksSettings, extra: Partial<ProjectModel> = {}): ProjectModel {
  return {
    id: 'p',
    slug: 'p',
    name: 'P',
    catalogRoot: 'docs/product',
    root: '/repo',
    components: [
      { id: 'core', slug: 'core', name: 'Core', kind: 'library', path: 'core', catalog: 'docs/product/core', codeBasePath: 'core/src' },
      { id: 'app', slug: 'app', name: 'App', kind: 'service', path: 'app', catalog: 'docs/product/app', dependsOn: ['core'] },
    ],
    ...(checks ? { checks } : {}),
    ...extra,
  };
}

function model(parts: Partial<CatalogModel>, p: ProjectModel = project(), files: string[] = []): CatalogModel {
  return {
    features: [],
    workflows: [],
    objects: [],
    ...parts,
    context: { projects: [p], exists: (f) => files.includes(f), operations: (c) => (c === 'app' ? new Set([operationKey('GET', '/orders/{id}')]) : null) },
  };
}

const design = (m: CatalogModel) => validateModel(m).filter((i) => i.check === 'design');
const codes = (issues: ValidationIssue[]) => issues.map((i) => `${i.code}:${i.id}${i.field ? ':' + i.field : ''}`);

describe('design checks (PRODUCTCREATOR-34)', () => {
  it('architecture: calls across components follow dependsOn; cycles in calls and dependsOn', () => {
    const m = model({
      features: [
        feature('core.a.do', 'core', { calls: ['app.b.do'] }), // core does not depend on app
        feature('app.b.do', 'app', { calls: ['core.c.do'] }), // ok: app depends on core
        feature('core.c.do', 'core', { calls: ['core.a.do'] }),
      ],
    });
    const found = codes(design(m));
    expect(found).toContain('call_outside_dependency:core.a.do:calls[0]');
    expect(found).not.toContain('call_outside_dependency:app.b.do:calls[0]');
    expect(found).toContain('call_cycle:app.b.do:calls');
    const cyclic = project(undefined, { components: [...project().components.slice(0, 1).map((c) => ({ ...c, dependsOn: ['app'] })), project().components[1]] });
    expect(codes(design(model({}, cyclic)))).toContain('dependency_cycle:app:dependsOn');
  });

  it('events: emitted without consumer, consumed without emitter, stream stages', () => {
    const stream: Stream = { stream: 'crm.sales', name: 'Sales', goal: 'g', lifecycle: 'draft', stages: [{ id: 'ST1', name: 'lead', entry_events: ['lead.created'], exit_events: ['deal.won'], performed_by: ['t'] }] };
    const m = model({
      features: [feature('crm.lead.create', 'core', { emits: ['lead.created', 'lead.logged'] }), feature('crm.deal.close', 'core', { consumes: ['deal.signed'] })],
      streams: [{ data: stream, component: 'core' }],
    });
    expect(codes(design(m))).toEqual(
      expect.arrayContaining(['event_not_consumed:crm.lead.create:emits[1]', 'event_not_emitted:crm.deal.close:consumes[0]', 'stream_event_unknown:crm.sales:stages[0].exit_events'])
    );
    expect(codes(design(m))).not.toContain('event_not_consumed:crm.lead.create:emits[0]');
  });

  it('objects and kinds', () => {
    const m = model({
      features: [
        feature('shop.order.view', 'core', { objects: [{ id: 'order', access: 'read' }, { id: 'total', access: 'write' }, { id: 'order.line', access: 'read' }] }),
      ],
      objects: [
        object('order', { fields: [{ name: 'lines', type: 'order.line[]' }, { name: 'sum', type: 'total' }] }),
        object('order.line', { kind: 'value' }),
        object('orphan'),
        object('note', { kind: 'value', tables: [{ name: 'notes' }] }),
        object('total', { kind: 'computed' }),
      ],
    });
    expect(codes(design(m))).toEqual(
      expect.arrayContaining([
        'object_never_written:order',
        'object_unused:orphan',
        'value_unused:note',
        'tables_on_non_entity:note:tables',
        'computed_without_producer:total:computedBy',
        'computed_written:shop.order.view:objects[1]',
        'value_in_feature_objects:shop.order.view:objects[2]',
        'entity_field_computed:order:fields.sum.type',
      ])
    );
    expect(codes(design(m))).not.toContain('value_unused:order.line');
  });

  it('lifecycle consistency: drafts, deprecated and removed references, implemented workflows', () => {
    const m = model({
      features: [
        feature('a.b.agreed', 'core', { lifecycle: 'approved', calls: ['a.b.draft', 'a.b.old', 'a.b.gone'], description: 'd' }),
        feature('a.b.draft', 'core'),
        feature('a.b.old', 'core', { lifecycle: 'deprecated' }),
        feature('a.b.gone', 'core', { lifecycle: 'removed' }),
      ],
      workflows: [workflow('a.flow', ['a.b.agreed', 'a.b.draft'], { lifecycle: 'implemented' })],
    });
    expect(codes(design(m))).toEqual(
      expect.arrayContaining([
        'uses_draft:a.b.agreed:calls[0]',
        'uses_deprecated:a.b.agreed:calls[1]',
        'uses_removed:a.b.agreed:calls[2]',
        'uses_draft:a.flow:steps[1]',
        'workflow_step_not_implemented:a.flow:steps[0]',
      ])
    );
  });

  it('completeness of agreed features and code links of implemented ones', () => {
    const done = feature('a.b.done', 'core', {
      lifecycle: 'implemented',
      requirements: [{ id: 'R1', text: 'x' }, { id: 'R2', text: 'y' }],
      acceptance: [{ id: 'A1', covers: ['R1'], text: 'ok' }],
      open_questions: [{ id: 'Q1', question: '?' }],
      source_file: 'gone.ts',
      code_refs: [{ component: 'app', file: 'page.tsx' }, { component: 'web', file: 'x.ts' }],
      apis: [{ method: 'GET', path: '/orders/:id' }, { method: 'POST', path: '/orders' }],
      actors: ['buyer', 'ghost'],
    });
    const m = model({ features: [done, feature('a.b.plan', 'core', { lifecycle: 'approved' })] }, project(undefined, { actors: [{ id: 'buyer', name: 'Buyer' }] }), ['/repo/app/page.tsx']);
    const found = codes(design(m));
    expect(found).toEqual(
      expect.arrayContaining([
        'missing_description:a.b.done:description',
        'requirement_not_covered:a.b.done:requirements[1]',
        'open_questions_left:a.b.done:open_questions',
        'acceptance_without_verify:a.b.done:acceptance[0]',
        'source_file_not_found:a.b.done:source_file',
        'code_ref_unknown_component:a.b.done:code_refs[1].component',
        'unknown_actor:a.b.done:actors[1]',
        'missing_requirements:a.b.plan:requirements',
      ])
    );
    expect(found).not.toContain('code_ref_file_not_found:a.b.done:code_refs[0].file');
    // apis are checked against the OpenAPI spec of the feature's component only (core has none)
    expect(found.filter((c) => c.startsWith('api_not_in_openapi'))).toEqual([]);
    const inApp = model({ features: [feature('a.b.api', 'app', { apis: [{ method: 'GET', path: '/orders/:id' }, { method: 'POST', path: '/orders' }] })] });
    expect(codes(design(inApp)).filter((c) => c.startsWith('api_not_in_openapi'))).toEqual(['api_not_in_openapi:a.b.api:apis[1]']);
  });

  it('severity: advisory shifts one level down, strict uses the intended level, overrides win, off hides, drafts stay warnings', () => {
    const parts = { features: [feature('a.b.done', 'core', { lifecycle: 'implemented', description: 'd', emits: ['x.happened'] })] };
    const sev = (checks?: ChecksSettings) => Object.fromEntries(design(model(parts, project(checks))).map((i) => [i.code, i.severity]));
    expect(sev()).toMatchObject({ missing_requirements: 'warning', missing_source_file: 'warning', event_not_consumed: 'info' });
    expect(sev({ mode: 'strict' })).toMatchObject({ missing_requirements: 'error', missing_source_file: 'error', event_not_consumed: 'warning' });
    expect(sev({ overrides: { missing_source_file: 'error', event_not_consumed: 'off' } })).toMatchObject({ missing_source_file: 'error', missing_requirements: 'warning' });
    expect(sev({ overrides: { event_not_consumed: 'off' } }).event_not_consumed).toBeUndefined();
    const issue = design(model(parts)).find((i) => i.code === 'missing_source_file');
    expect(issue).toMatchObject({ check: 'design', intended: 'error', severity: 'warning' });
    // a draft never gets an error from a design check, even in strict mode
    const draft = model({ features: [feature('core.a.do', 'core', { calls: ['app.b.do'] }), feature('app.b.do', 'app')] }, project({ mode: 'strict' }));
    expect(design(draft).find((i) => i.code === 'call_outside_dependency')?.severity).toBe('warning');
  });

  it('advisory checks never block a plan; strict ones do', () => {
    const change = [{ kind: 'feature' as const, data: feature('a.b.done', 'core', { lifecycle: 'implemented', description: 'd' }).data, component: 'core' }];
    expect(planIssues(model({}), change).ok).toBe(true);
    expect(planIssues(model({}, project({ mode: 'strict' })), change).ok).toBe(false);
  });

  it('helpers: operation keys and cycles', () => {
    expect(operationKey('get', '/orders/:id/')).toBe(operationKey('GET', '/orders/{orderId}'));
    expect(cycles(['a', 'b', 'c', 'd'], (n) => ({ a: ['b'], b: ['a'], c: ['c'], d: [] })[n] ?? [])).toEqual([['a', 'b'], ['c']]);
  });

  it('a plan that writes a translation is checked as it will be saved (stamped): no false stale issue (PRODUCTCREATOR-37)', () => {
    const m = model({}, project(undefined, { languages: ['en', 'ru'] }));
    const f = feature('shop.order.create', 'core', { i18n: { ru: { name: 'Создать заказ' } } });
    expect(planIssues(m, [{ kind: 'feature', data: f.data, component: 'core' }]).introduced.filter((i) => i.code.startsWith('translation_'))).toEqual([]);
    // an unstamped translation already in the model is still reported
    expect(validateModel(model({ features: [f] }, project(undefined, { languages: ['en', 'ru'] }))).map((i) => i.code)).toContain('translation_stale');
  });
});
