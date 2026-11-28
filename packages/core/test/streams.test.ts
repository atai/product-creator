import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject, toStorageEntities, updateProject, PROJECT_FILE, readProject, type ProjectModel } from '../src/project/model';
import { configureStorage, getStorage, resetStorage } from '../src/storage';
import { validateModel, type ValidationIssue } from '../src/validation/model';
import { planIssues } from '../src/validation/plan';
import type { Feature, Stream } from '../src/types';

/** Streams as full catalog entries (PRODUCTCREATOR-43) */
let root: string;
let project: ProjectModel;

const feature = (id: string, extra: Partial<Feature> = {}): Feature => {
  const [bounded_context, entity, action] = id.split('.');
  return { id, name: id, bounded_context, entity, action, owner: 't', lifecycle: 'implemented', ...extra };
};
const stream = (extra: Partial<Stream> = {}): Stream => ({
  stream: 'app.error_lifecycle',
  name: 'From an error to the fix',
  goal: 'Errors are found and fixed without the user',
  lifecycle: 'draft',
  kpis: [{ id: 'K1', name: 'Symbolicated releases', target: '100%' }],
  stages: [
    { id: 'ST1', name: 'Caught', entry_events: ['app.error.raised'], exit_events: ['app.error.reported'], features: ['app.error.report'] },
    { id: 'ST2', name: 'Grouped', entry_events: ['app.error.reported'], exit_events: ['glitchtip.issue.created'], performed_by: ['glitchtip'] },
  ],
  tickets: ['PRODUCTCREATOR-43'],
  ...extra,
});

async function load() {
  await resetStorage();
  configureStorage({ manifest: { ...toStorageEntities([readProject(root)!]), source: PROJECT_FILE }, watch: false });
  return getStorage();
}
const codes = (issues: ValidationIssue[], kind = 'stream') => issues.filter((i) => i.kind === kind).map((i) => `${i.code}:${i.field ?? ''}`);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-streams-'));
  process.env.PC_LOG_DIR = path.join(root, '.logs-outside');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo', private: true }));
  project = openProject(root).project;
  updateProject(root, {
    languages: ['en', 'ru'],
    actors: [{ id: 'developer', name: 'Developer' }],
    systems: [{ id: 'glitchtip', name: 'GlitchTip', emits: ['glitchtip.issue.created'], consumes: ['app.error.reported'] }],
  });
});

afterEach(async () => {
  await resetStorage();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('streams (PRODUCTCREATOR-43)', () => {
  it('a stream is saved with every field, translations stamped, and read back', async () => {
    const storage = await load();
    const catalog = path.join(root, project.components[0].catalog);
    const data = stream({ description: 'Scope', owner: 'atai', i18n: { ru: { name: 'От ошибки до исправления', stages: { ST1: { name: 'Поймана' } } } } });
    expect((await storage.saveStream(data, catalog)).success).toBe(true);
    const file = yaml.load(fs.readFileSync(path.join(catalog, 'streams/app.error_lifecycle.yml'), 'utf8')) as Stream & { i18n: { ru: { _source: { name: string } } } };
    expect(file).toMatchObject({ lifecycle: 'draft', owner: 'atai', description: 'Scope', tickets: ['PRODUCTCREATOR-43'], kpis: [{ id: 'K1' }] });
    expect(file.i18n.ru._source.name).toMatch(/^[0-9a-f]{8}$/);
    const back = (await load()).getStreamById('app.error_lifecycle');
    expect(back?.stages[1].performed_by).toEqual(['glitchtip']);
  });

  it('references: stage features and performers must exist; ids of stages and KPIs are unique', async () => {
    const storage = await load();
    const m = storage.modelSnapshot();
    m.features.push({ data: feature('app.error.report', { lifecycle: 'draft', emits: ['app.error.reported'] }), component: project.components[0].id });
    const bad = stream({ stages: [{ id: 'ST1', name: 'Caught', entry_events: ['app.error.raised'], exit_events: ['app.error.reported'], features: ['app.error.nope'], performed_by: ['robot'] }, { id: 'ST1', name: 'Again', entry_events: ['a.b'], exit_events: ['c.d'] }] });
    const issues = validateModel({ ...m, streams: [{ data: bad, component: project.components[0].id }] });
    expect(codes(issues)).toEqual(
      expect.arrayContaining(['unknown_feature:stages[0].features[0]', 'unknown_performer:stages[0].performed_by[0]', 'duplicate_id:stages[1].id', 'stage_without_work:stages[1]'])
    );
  });

  it('events of systems count: a stage waiting for a system event is not reported', async () => {
    const storage = await load();
    const m = storage.modelSnapshot();
    m.features.push({ data: feature('app.error.report', { lifecycle: 'draft', emits: ['app.error.reported'] }), component: project.components[0].id });
    const issues = validateModel({ ...m, streams: [{ data: stream(), component: project.components[0].id }] });
    expect(codes(issues)).not.toContain('stream_event_unknown:stages[1].exit_events');
    expect(codes(issues)).toContain('stream_event_unknown:stages[0].entry_events'); // app.error.raised: nothing emits it
    expect(codes(issues, 'feature')).not.toContain('event_not_consumed:emits[0]'); // glitchtip consumes it
  });

  it('lifecycle: an agreed stream with a draft feature, an implemented stream with an unimplemented one', async () => {
    const storage = await load();
    const m = storage.modelSnapshot();
    m.features.push({ data: feature('app.error.report', { lifecycle: 'draft', emits: ['app.error.reported'] }), component: project.components[0].id });
    const at = (lifecycle: Stream['lifecycle']) => codes(validateModel({ ...m, streams: [{ data: stream({ lifecycle }), component: project.components[0].id }] }));
    expect(at('approved')).toContain('uses_draft:stages[0].features[0]');
    m.features[m.features.length - 1].data.lifecycle = 'approved';
    expect(at('implemented')).toContain('stream_stage_not_implemented:stages[0].features[0]');
  });

  it('a plan can carry a stream; a stream with an unknown feature is rejected', async () => {
    const storage = await load();
    const m = storage.modelSnapshot();
    const ok = planIssues(m, [
      { kind: 'feature', data: feature('app.error.report', { lifecycle: 'draft', emits: ['app.error.reported'] }), component: project.components[0].id },
      { kind: 'stream', data: stream(), component: project.components[0].id },
    ]);
    expect(ok.ok).toBe(true);
    const bad = planIssues(m, [{ kind: 'stream', data: stream(), component: project.components[0].id }]);
    expect(bad.ok).toBe(false);
    expect(bad.introduced.map((i) => i.code)).toContain('unknown_feature');
  });

  it('translations of a stream are checked: a changed stage name makes its translation stale', async () => {
    const storage = await load();
    const catalog = path.join(root, project.components[0].catalog);
    await storage.saveFeature(feature('app.error.report', { lifecycle: 'draft', emits: ['app.error.reported'] }), catalog);
    await storage.saveStream(stream({ i18n: { ru: { stages: { ST1: { name: 'Поймана' } } } } }), catalog);
    const saved = storage.getStreamById('app.error_lifecycle')!;
    const changed = { ...saved, stages: saved.stages.map((s) => (s.id === 'ST1' ? { ...s, name: 'Caught and scrubbed' } : s)) };
    const issues = planIssues(storage.modelSnapshot(), [{ kind: 'stream', data: changed }]).introduced;
    expect(codes(issues)).toContain('translation_stale:i18n.ru.stages.ST1.name');
  });
});
