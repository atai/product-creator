import featureSchema from '../../schema/feature.schema.json';
import workflowSchema from '../../schema/workflow.schema.json';
import businessObjectSchema from '../../schema/business-object.schema.json';
import streamSchema from '../../schema/stream.schema.json';
import { forAudience } from './audience';
import type { SpecModel } from './build';

/**
 * Agent view of the spec (PRODUCTCREATOR-35): a manifest and one small JSON chunk per feature, business object,
 * workflow and stream (PRODUCTCREATOR-43), so an agent reads the manifest and loads only what a task needs. Fields for agents (`x-audience`
 * agent / both) only. Every chunk carries the issues of its entry.
 */
export const AGENT_FORMAT = 'product-creator.spec/1';
/** Chunks above this size are flagged in the manifest (split the feature, or shorten it) */
export const CHUNK_BUDGET_BYTES = 16_000;

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const fileName = (id: string) => id.replace(/[^A-Za-z0-9_.-]/g, '_') + '.json';

export interface AgentEntry {
  kind: 'feature' | 'business_object' | 'workflow' | 'stream';
  id: string;
  name: string;
  lifecycle: string;
  component: string;
  /** Path of the chunk relative to the manifest */
  file: string;
  bytes: number;
  overBudget?: true;
  issues: number;
}

/** Files of the bundle, keyed by path relative to the bundle folder (manifest.json, features/…, objects/…, workflows/…) */
export function renderAgent(spec: SpecModel, meta: { labelsLanguage: string; labelsFallback: boolean }): Record<string, string> {
  const files: Record<string, string> = {};
  const entries: AgentEntry[] = [];
  const objects = new Map(spec.objects.map((o) => [o.data.id, o.data]));
  const add = (kind: AgentEntry['kind'], id: string, name: string, lifecycle: string, component: string, folder: string, chunk: unknown, issues: number) => {
    const file = `${folder}/${fileName(id)}`;
    files[file] = json(chunk);
    const bytes = Buffer.byteLength(files[file]);
    entries.push({ kind, id, name, lifecycle, component, file, bytes, ...(bytes > CHUNK_BUDGET_BYTES ? { overBudget: true as const } : {}), issues });
  };

  for (const f of spec.features) {
    const feature = forAudience(f.data, featureSchema, 'agent');
    const used = (f.data.objects ?? []).map((ref) => {
      const o = objects.get(ref.id);
      return { id: ref.id, access: ref.access, ...(o ? { name: o.name, fields: o.fields } : { missing: true }) };
    });
    add('feature', f.data.id, f.data.name, f.data.lifecycle, f.component.slug, 'features', { kind: 'feature', component: f.component.slug, feature, objects: used, calledBy: f.calledBy, workflows: f.workflows, ...(f.screens.length ? { screenshots: f.screens.map((s) => ({ id: s.screen.id, title: s.screen.title, path: s.screen.path, file: s.file, exists: s.exists, ...(s.error ? { error: s.error } : {}) })) } : {}), issues: f.issues }, f.issues.length);
  }
  for (const o of spec.objects) {
    add('business_object', o.data.id, o.data.name, o.data.lifecycle, o.component.slug, 'objects', { kind: 'business_object', component: o.component.slug, object: forAudience(o.data, businessObjectSchema, 'agent'), usedBy: o.usedBy, issues: o.issues }, o.issues.length);
  }
  for (const w of spec.workflows) {
    add('workflow', w.data.workflow, w.data.name ?? w.data.workflow, w.data.lifecycle, w.component.slug, 'workflows', { kind: 'workflow', component: w.component.slug, workflow: forAudience(w.data, workflowSchema, 'agent'), issues: w.issues }, w.issues.length);
  }

  // streams (PRODUCTCREATOR-43): every stage with the features, workflows and performers it names, resolved
  const featureById = new Map(spec.features.map((f) => [f.data.id, f.data]));
  const workflowById = new Map(spec.workflows.map((w) => [w.data.workflow, w.data]));
  const performers = new Map<string, unknown>([
    ...(spec.project.actors ?? []).map((a) => [a.id, { kind: 'actor', ...a }] as const),
    ...(spec.project.systems ?? []).map((x) => [x.id, { kind: 'system', ...x }] as const),
  ]);
  for (const st of spec.streams) {
    const stages = (st.data.stages ?? []).map((stage) => ({
      ...stage,
      features: (stage.features ?? []).map((id) => {
        const f = featureById.get(id);
        return f ? { id, name: f.name, lifecycle: f.lifecycle, component: spec.features.find((x) => x.data.id === id)?.component.slug, emits: f.emits, consumes: f.consumes } : { id, missing: true };
      }),
      workflows: (stage.workflows ?? []).map((id) => {
        const w = workflowById.get(id);
        return w ? { id, name: w.name, lifecycle: w.lifecycle, steps: w.steps } : { id, missing: true };
      }),
      performed_by: (stage.performed_by ?? []).map((id) => performers.get(id) ?? { id, missing: true }),
    }));
    const stream = { ...forAudience(st.data, streamSchema, 'agent'), stages };
    add('stream', st.data.stream, st.data.name ?? st.data.stream, st.data.lifecycle, st.component.slug, 'streams', { kind: 'stream', component: st.component.slug, stream, issues: st.issues }, st.issues.length);
  }

  files['manifest.json'] = json({
    format: AGENT_FORMAT,
    project: spec.project,
    language: spec.language,
    labels: { language: meta.labelsLanguage, ...(meta.labelsFallback ? { fallback: true } : {}) },
    components: spec.components,
    ready: spec.counts.errors === 0,
    counts: { ...spec.counts, features: spec.features.length, objects: spec.objects.length, workflows: spec.workflows.length, streams: spec.streams.length },
    chunkBudgetBytes: CHUNK_BUDGET_BYTES,
    /** screenshots[].file are relative to the spec folder (the parent of this bundle) */
    screenshotsBase: '..',
    entries,
    issues: spec.issues.map(({ severity, code, kind, id, field, message }) => ({ severity, code, kind, id, ...(field ? { field } : {}), message })),
  });
  return files;
}
