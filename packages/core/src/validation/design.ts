import * as fs from 'fs';
import * as path from 'path';
import { projectLanguages, type ComponentModel, type ProjectModel } from '../project/model';
import { translationProblems } from '../i18n';
import { catalogSchemas } from './schemas';
import productSchema from '../../schema/product.schema.json';
import { kindOf, type BusinessObject, type Feature, type Lifecycle, type Stream, type Workflow } from '../types';
import { referencedType, typeKey, type CatalogModel, type DesignContext, type IssueKind, type ModelEntry, type Severity, type ValidationIssue } from './model';

/**
 * Design checks (PRODUCTCREATOR-34): what is consistent but badly planned — architecture, events, object usage,
 * lifecycle consistency, completeness, code links, object kinds, actors, streams.
 *
 * Every check has an intended severity (the lifecycle rules of the catalog). It is reported according to
 * `checks` of product-creator.yml: advisory (default) shifts it one level down (error → warning, warning → info)
 * so that nothing is blocked while the checks are new; strict uses the intended level; an override per code wins,
 * `off` hides it. A draft entry never gets more than a warning from a design check.
 */
export const DESIGN_CHECKS = {
  call_outside_dependency: { intended: 'error', title: 'A feature calls a feature of a component its component does not depend on' },
  dependency_cycle: { intended: 'warning', title: 'Components depend on each other in a cycle' },
  call_cycle: { intended: 'warning', title: 'Features call each other in a cycle' },
  event_not_consumed: { intended: 'warning', title: 'An event is emitted but nothing consumes it' },
  event_not_emitted: { intended: 'warning', title: 'An event is consumed but nothing emits it' },
  object_never_written: { intended: 'warning', title: 'An entity is read but no feature writes it' },
  object_unused: { intended: 'warning', title: 'No feature or other object uses the object' },
  value_unused: { intended: 'warning', title: 'No field uses the value object' },
  tables_on_non_entity: { intended: 'warning', title: 'A value or computed object has tables' },
  computed_without_producer: { intended: 'warning', title: 'A computed object does not say which features compute it' },
  computed_written: { intended: 'warning', title: 'A feature writes a computed object' },
  value_in_feature_objects: { intended: 'warning', title: 'A feature uses a value object directly' },
  entity_field_computed: { intended: 'warning', title: 'A stored entity has a field typed by a computed object' },
  uses_draft: { intended: 'error', title: 'Agreed work depends on a draft' },
  workflow_step_not_implemented: { intended: 'error', title: 'An implemented workflow has a step that is not implemented' },
  uses_deprecated: { intended: 'warning', title: 'New work uses a deprecated entry' },
  uses_removed: { intended: 'error', title: 'A removed entry is still referenced' },
  missing_description: { intended: 'error', title: 'An agreed feature has no description' },
  missing_requirements: { intended: 'error', title: 'An agreed feature has no requirements' },
  requirement_not_covered: { intended: 'error', title: 'A requirement has no acceptance criterion' },
  open_questions_left: { intended: 'error', title: 'An agreed feature still has open questions' },
  acceptance_without_verify: { intended: 'warning', title: 'An acceptance criterion of an implemented feature has no verify' },
  missing_source_file: { intended: 'error', title: 'An implemented feature has no source_file' },
  source_file_not_found: { intended: 'error', title: 'The source_file does not exist' },
  code_ref_file_not_found: { intended: 'error', title: 'A code_refs file does not exist' },
  code_ref_unknown_component: { intended: 'error', title: 'code_refs names a component that is not in the project' },
  api_not_in_openapi: { intended: 'warning', title: 'An API of a feature is not an operation of the component OpenAPI spec' },
  unknown_actor: { intended: 'error', title: 'A feature names an actor the project does not define' },
  stream_event_unknown: { intended: 'warning', title: 'A stream stage waits for an event nothing emits' },
  stream_stage_not_implemented: { intended: 'error', title: 'An implemented stream has a stage whose features or workflows are not implemented' },
  unknown_performer: { intended: 'error', title: 'A stream stage is performed by someone the project does not define' },
  stage_without_work: { intended: 'warning', title: 'A stream stage names no feature, workflow or performer' },
  library_emits: { intended: 'error', title: 'A library declares runtime events (a library runs inside a service)' },
  translation_stale: { intended: 'warning', title: 'The primary text changed after it was translated' },
  translation_orphan: { intended: 'warning', title: 'A translation of an item that no longer exists' },
  translation_unknown_language: { intended: 'warning', title: 'A translation into a language the project does not have' },
} as const satisfies Record<string, { intended: Severity; title: string }>;

export type DesignCode = keyof typeof DESIGN_CHECKS;

/** `a draft`, `an implemented` */
const an = (word: string) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

const AGREED = new Set<Lifecycle>(['approved', 'implemented', 'deprecated']);
const IN_CODE = new Set<Lifecycle>(['implemented', 'deprecated']);
const shift: Record<Severity, Severity> = { error: 'warning', warning: 'info', info: 'info' };

interface Owner {
  project: ProjectModel;
  component: ComponentModel;
}

export function designIssues(model: CatalogModel, context: DesignContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const exists = context.exists ?? ((p: string) => fs.existsSync(p));
  const owners = new Map<string, Owner>();
  for (const project of context.projects) for (const component of project.components) owners.set(component.id, { project, component });

  const features = new Map(model.features.map((e) => [e.data.id, e]));
  const objects = new Map(model.objects.map((e) => [e.data.id, e]));
  const objectByType = new Map<string, ModelEntry<BusinessObject>>();
  for (const e of model.objects) {
    objectByType.set(typeKey(e.data.id), e);
    if (e.data.name) objectByType.set(typeKey(e.data.name), e);
  }
  const typeTarget = (type: string) => {
    const ref = referencedType(type);
    return ref ? objectByType.get(typeKey(ref)) : undefined;
  };

  /** Reports a design issue with the severity its project asks for; null lifecycle = not an entry with a lifecycle */
  const add = (
    code: DesignCode,
    entry: { kind: IssueKind; id: string; component?: string; file?: string; lifecycle?: Lifecycle | null },
    field: string | undefined,
    message: string
  ) => {
    let intended: Severity = DESIGN_CHECKS[code].intended;
    if (entry.lifecycle === 'draft' && intended === 'error') intended = 'warning';
    const project = entry.component ? owners.get(entry.component)?.project : context.projects.length === 1 ? context.projects[0] : undefined;
    const override = project?.checks?.overrides?.[code];
    if (override === 'off') return;
    const severity: Severity = override ?? (project?.checks?.mode === 'strict' ? intended : shift[intended]);
    issues.push({ severity, intended, check: 'design', code, kind: entry.kind, id: entry.id, ...(field ? { field } : {}), message, ...(entry.file ? { file: entry.file } : {}), ...(entry.component ? { component: entry.component } : {}) });
  };
  const fEntry = (e: ModelEntry<Feature>) => ({ kind: 'feature' as const, id: e.data.id, component: e.component, file: e.file, lifecycle: e.data.lifecycle });
  const oEntry = (e: ModelEntry<BusinessObject>) => ({ kind: 'business_object' as const, id: e.data.id, component: e.component, file: e.file, lifecycle: e.data.lifecycle });
  const wEntry = (e: ModelEntry<Workflow>) => ({ kind: 'workflow' as const, id: e.data.workflow, component: e.component, file: e.file, lifecycle: e.data.lifecycle });
  const sEntry = (e: ModelEntry<Stream>) => ({ kind: 'stream' as const, id: e.data.stream, component: e.component, file: e.file, lifecycle: e.data.lifecycle });
  const streams = (model.streams ?? []).filter((e) => e.data.lifecycle !== 'removed');
  const live = <T extends { lifecycle?: Lifecycle }>(e: ModelEntry<T>) => e.data.lifecycle !== 'removed';

  // ------------------------------------------------------------------ architecture
  const closure = (componentId: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(owners.get(componentId)?.component.dependsOn ?? [])];
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(owners.get(id)?.component.dependsOn ?? []));
    }
    return seen;
  };
  const deps = new Map<string, Set<string>>();
  for (const e of model.features.filter(live)) {
    if (!e.component || !owners.has(e.component)) continue;
    (e.data.calls ?? []).forEach((call, i) => {
      const target = features.get(call);
      if (!target?.component || target.component === e.component || !owners.has(target.component)) return;
      if (owners.get(target.component)?.project !== owners.get(e.component as string)?.project) return;
      const reach = deps.get(e.component as string) ?? closure(e.component as string);
      deps.set(e.component as string, reach);
      if (!reach.has(target.component)) {
        const from = owners.get(e.component as string)?.component.slug;
        const to = owners.get(target.component)?.component.slug;
        add('call_outside_dependency', fEntry(e), `calls[${i}]`, `Calls ${call} of component "${to}", but "${from}" does not depend on "${to}". Add "${to}" to dependsOn of "${from}", or move one of the features.`);
      }
    });
  }
  for (const project of context.projects) {
    for (const cycle of cycles(project.components.map((c) => c.id), (id) => project.components.find((c) => c.id === id)?.dependsOn ?? [])) {
      const slugs = cycle.map((id) => project.components.find((c) => c.id === id)?.slug ?? id);
      add('dependency_cycle', { kind: 'component', id: slugs[0], component: cycle[0] }, 'dependsOn', `Components depend on each other in a cycle: ${[...slugs, slugs[0]].join(' → ')}. Break the cycle: move the shared part to a library both depend on.`);
    }
  }
  const liveIds = model.features.filter(live).map((e) => e.data.id);
  for (const cycle of cycles(liveIds, (id) => (features.get(id)?.data.calls ?? []).filter((c) => features.has(c)))) {
    const first = features.get(cycle[0]) as ModelEntry<Feature>;
    add('call_cycle', fEntry(first), 'calls', `Features call each other in a cycle: ${[...cycle, cycle[0]].join(' → ')}. Check that the cycle is intended (e.g. recursion) or split a feature.`);
  }

  // ------------------------------------------------------------------ events
  const emitted = new Set<string>();
  const consumed = new Set<string>();
  for (const e of model.features.filter(live)) {
    (e.data.emits ?? []).forEach((ev) => emitted.add(ev));
    (e.data.consumes ?? []).forEach((ev) => consumed.add(ev));
  }
  for (const w of model.workflows.filter(live)) (w.data.emits ?? []).forEach((ev) => emitted.add(ev));
  for (const st of streams) for (const stage of st.data.stages ?? []) [...(stage.entry_events ?? []), ...(stage.exit_events ?? [])].forEach((ev) => consumed.add(ev));
  // external systems of the product context emit and consume events too (PRODUCTCREATOR-43)
  for (const project of context.projects) {
    // runtime events of running components: unhandled errors, start, scheduled jobs (PRODUCTCREATOR-43)
    for (const component of project.components) {
      (component.emits ?? []).forEach((ev, i) => {
        if (component.kind === 'library') add('library_emits', { kind: 'component', id: component.slug, component: component.id }, `emits[${i}]`, `The library ${component.slug} declares the event "${ev}", but a library runs inside a service. Declare it on the service that loads the library.`);
        else emitted.add(ev);
      });
    }
    for (const system of project.systems ?? []) {
      (system.emits ?? []).forEach((ev) => emitted.add(ev));
      (system.consumes ?? []).forEach((ev) => consumed.add(ev));
    }
  }
  for (const e of model.features.filter(live)) {
    (e.data.emits ?? []).forEach((ev, i) => {
      if (!consumed.has(ev)) add('event_not_consumed', fEntry(e), `emits[${i}]`, `Emits "${ev}", but no feature consumes it and no stream stage waits for it. Add the consumer, or drop the event.`);
    });
    (e.data.consumes ?? []).forEach((ev, i) => {
      if (!emitted.has(ev)) add('event_not_emitted', fEntry(e), `consumes[${i}]`, `Consumes "${ev}", but no feature, workflow or system emits it. Add the emitter, or fix the event name.`);
    });
  }
  for (const w of model.workflows.filter(live)) {
    (w.data.emits ?? []).forEach((ev, i) => {
      if (!consumed.has(ev)) add('event_not_consumed', wEntry(w), `emits[${i}]`, `Emits "${ev}", but no feature consumes it and no stream stage waits for it. Add the consumer, or drop the event.`);
    });
  }
  for (const st of streams) {
    (st.data.stages ?? []).forEach((stage, i) => {
      [...(stage.entry_events ?? []).map((ev) => ['entry_events', ev] as const), ...(stage.exit_events ?? []).map((ev) => ['exit_events', ev] as const)].forEach(([list, ev]) => {
        if (!emitted.has(ev)) add('stream_event_unknown', sEntry(st), `stages[${i}].${list}`, `Stage "${stage.name}" waits for "${ev}", which no feature, workflow or system emits. Add the emitter (a feature, or a system in product-creator.yml), or fix the event name.`);
      });
    });
  }

  // ------------------------------------------------------------------ business objects and kinds
  const readers = new Map<string, string[]>();
  const writers = new Map<string, string[]>();
  for (const e of model.features.filter(live)) {
    for (const ref of e.data.objects ?? []) (ref.access === 'write' ? writers : readers).set(ref.id, [...((ref.access === 'write' ? writers : readers).get(ref.id) ?? []), e.data.id]);
  }
  const typedBy = new Map<string, string[]>(); // object id → objects with a field of its type
  for (const o of model.objects.filter(live)) {
    for (const f of o.data.fields ?? []) {
      const target = f && typeof f.type === 'string' ? typeTarget(f.type) : undefined;
      if (target && target.data.id !== o.data.id) typedBy.set(target.data.id, [...(typedBy.get(target.data.id) ?? []), o.data.id]);
    }
  }
  for (const o of model.objects.filter(live)) {
    const k = kindOf(o.data);
    const id = o.data.id;
    const used = readers.has(id) || writers.has(id) || typedBy.has(id) || Boolean(o.data.computedBy?.length);
    if (k === 'entity' && readers.has(id) && !writers.has(id)) add('object_never_written', oEntry(o), undefined, `Read by ${(readers.get(id) ?? []).join(', ')}, but no feature writes it. Add the feature that creates or changes it (objects: access write).`);
    if (k !== 'value' && !used) add('object_unused', oEntry(o), undefined, `No feature reads or writes it and no object has a field of its type. Link it from the features that use it (objects), or remove it.`);
    if (k === 'value' && !typedBy.has(id)) add('value_unused', oEntry(o), undefined, `No field of another object has this type. Use it as a field type (e.g. ${id}[]), or remove it.`);
    if (k !== 'entity' && o.data.tables?.length) add('tables_on_non_entity', oEntry(o), 'tables', `${an(k).replace(/^a/, 'A')} object is not stored on its own, but has tables. Remove tables, or make it an entity.`);
    if (k === 'computed' && !o.data.computedBy?.length) add('computed_without_producer', oEntry(o), 'computedBy', `Say which features compute it: computedBy: [feature ids].`);
    if (k === 'entity') {
      (o.data.fields ?? []).forEach((f) => {
        const target = f && typeof f.type === 'string' ? typeTarget(f.type) : undefined;
        if (target && kindOf(target.data) === 'computed') add('entity_field_computed', oEntry(o), `fields.${f.name}.type`, `Field "${f.name}" is typed by the computed object ${target.data.id}, which is not stored. Store what is needed, or make this object computed too.`);
      });
    }
  }
  for (const e of model.features.filter(live)) {
    (e.data.objects ?? []).forEach((ref, i) => {
      const target = objects.get(ref.id);
      if (!target) return;
      if (kindOf(target.data) === 'computed' && ref.access === 'write') add('computed_written', fEntry(e), `objects[${i}]`, `Writes ${ref.id}, which is computed (not stored). Use access: read, or make ${ref.id} an entity.`);
      if (kindOf(target.data) === 'value') add('value_in_feature_objects', fEntry(e), `objects[${i}]`, `Uses the value object ${ref.id} directly; values come with the entity that holds them. Use that entity instead.`);
    });
  }

  // ------------------------------------------------------------------ lifecycle consistency
  const featureLife = (id: string) => features.get(id)?.data.lifecycle;
  for (const e of model.features.filter(live)) {
    const life = e.data.lifecycle;
    (e.data.calls ?? []).forEach((call, i) => {
      const target = featureLife(call);
      if (target === 'removed') add('uses_removed', fEntry(e), `calls[${i}]`, `Calls ${call}, which is removed. Remove the call, or call its replacement.`);
      else if (AGREED.has(life) && target === 'draft') add('uses_draft', fEntry(e), `calls[${i}]`, `This ${life} feature calls ${call}, which is still a draft. Agree ${call} first (approved), or make this feature a draft.`);
      else if (life !== 'deprecated' && target === 'deprecated') add('uses_deprecated', fEntry(e), `calls[${i}]`, `Calls ${call}, which is deprecated. Call its replacement.`);
    });
    (e.data.objects ?? []).forEach((ref, i) => {
      const target = objects.get(ref.id)?.data.lifecycle;
      if (target === 'removed') add('uses_removed', fEntry(e), `objects[${i}]`, `Uses ${ref.id}, which is removed. Remove the reference.`);
      else if (AGREED.has(life) && ref.access === 'write' && target === 'draft') add('uses_draft', fEntry(e), `objects[${i}]`, `This ${life} feature writes ${ref.id}, which is still a draft. Agree the object first, or make this feature a draft.`);
      else if (life !== 'deprecated' && target === 'deprecated') add('uses_deprecated', fEntry(e), `objects[${i}]`, `Uses ${ref.id}, which is deprecated. Use its replacement.`);
    });
  }
  for (const w of model.workflows.filter(live)) {
    const life = w.data.lifecycle;
    (w.data.steps ?? []).forEach((step, i) => {
      const target = featureLife(step);
      if (!target) return;
      if (target === 'removed') add('uses_removed', wEntry(w), `steps[${i}]`, `Step ${step} is removed. Remove the step, or use its replacement.`);
      else if (AGREED.has(life) && target === 'draft') add('uses_draft', wEntry(w), `steps[${i}]`, `This ${life} workflow has the draft step ${step}. Agree the step first, or make the workflow a draft.`);
      else if (life === 'implemented' && target !== 'implemented' && target !== 'deprecated') add('workflow_step_not_implemented', wEntry(w), `steps[${i}]`, `This workflow is implemented, but step ${step} is ${target}. Implement the step, or set the workflow back to approved.`);
      else if (life !== 'deprecated' && target === 'deprecated') add('uses_deprecated', wEntry(w), `steps[${i}]`, `Step ${step} is deprecated. Use its replacement.`);
    });
  }
  // streams (PRODUCTCREATOR-43): the features and workflows of a stage, like the steps of a workflow
  const workflowLife = new Map(model.workflows.map((w) => [w.data.workflow, w.data.lifecycle]));
  for (const st of streams) {
    const life = st.data.lifecycle;
    (st.data.stages ?? []).forEach((stage, i) => {
      const refs = [
        ...(stage.features ?? []).map((id, j) => ({ id, field: `stages[${i}].features[${j}]`, what: 'feature', target: featureLife(id) })),
        ...(stage.workflows ?? []).map((id, j) => ({ id, field: `stages[${i}].workflows[${j}]`, what: 'workflow', target: workflowLife.get(id) })),
      ];
      for (const r of refs) {
        if (!r.target) continue;
        if (r.target === 'removed') add('uses_removed', sEntry(st), r.field, `Stage "${stage.name}" uses the ${r.what} ${r.id}, which is removed. Remove it, or use its replacement.`);
        else if (AGREED.has(life) && r.target === 'draft') add('uses_draft', sEntry(st), r.field, `This ${life} stream uses the draft ${r.what} ${r.id} in stage "${stage.name}". Agree it first, or make the stream a draft.`);
        else if (life === 'implemented' && r.target !== 'implemented' && r.target !== 'deprecated') add('stream_stage_not_implemented', sEntry(st), r.field, `This stream is implemented, but the ${r.what} ${r.id} of stage "${stage.name}" is ${r.target}. Implement it, or set the stream back to approved.`);
        else if (life !== 'deprecated' && r.target === 'deprecated') add('uses_deprecated', sEntry(st), r.field, `Stage "${stage.name}" uses the deprecated ${r.what} ${r.id}. Use its replacement.`);
      }
      if (!stage.features?.length && !stage.workflows?.length && !stage.performed_by?.length) {
        add('stage_without_work', sEntry(st), `stages[${i}]`, `Stage "${stage.name}" names no feature, workflow or performer: say who or what does its work.`);
      }
    });
    // performers: actors or systems of the project of the stream
    const project = st.component ? owners.get(st.component)?.project : context.projects.length === 1 ? context.projects[0] : undefined;
    if (project) {
      const known = new Set([...(project.actors ?? []).map((a) => a.id), ...(project.systems ?? []).map((x) => x.id)]);
      (st.data.stages ?? []).forEach((stage, i) => {
        (stage.performed_by ?? []).forEach((who, j) => {
          if (!known.has(who)) add('unknown_performer', sEntry(st), `stages[${i}].performed_by[${j}]`, `"${who}" is neither an actor nor a system of the project (${[...known].join(', ') || 'none defined'}). Use one of them, or add it to actors or systems in product-creator.yml.`);
        });
      });
    }
  }
  for (const o of model.objects.filter(live)) {
    (o.data.fields ?? []).forEach((f) => {
      const target = f && typeof f.type === 'string' ? typeTarget(f.type) : undefined;
      if (target?.data.lifecycle === 'removed') add('uses_removed', oEntry(o), `fields.${f.name}.type`, `Field "${f.name}" is typed by ${target.data.id}, which is removed. Change the type.`);
    });
    (o.data.computedBy ?? []).forEach((fid, i) => {
      if (featureLife(fid) === 'removed') add('uses_removed', oEntry(o), `computedBy[${i}]`, `Computed by ${fid}, which is removed. Name the feature that computes it now.`);
    });
  }

  // ------------------------------------------------------------------ completeness and code links
  for (const e of model.features.filter(live)) {
    const f = e.data;
    const owner = e.component ? owners.get(e.component) : undefined;
    if (AGREED.has(f.lifecycle)) {
      if (!f.description?.trim()) add('missing_description', fEntry(e), 'description', `${an(f.lifecycle).replace(/^a/, 'A')} feature needs a description: what it does and for whom.`);
      if (!f.requirements?.length) add('missing_requirements', fEntry(e), 'requirements', `${an(f.lifecycle).replace(/^a/, 'A')} feature needs requirements: what it must do, one testable statement each.`);
      const covered = new Set((f.acceptance ?? []).flatMap((a) => a.covers ?? []));
      (f.requirements ?? []).forEach((r, i) => {
        if (!covered.has(r.id)) add('requirement_not_covered', fEntry(e), `requirements[${i}]`, `Requirement ${r.id} has no acceptance criterion. Add one with covers: [${r.id}].`);
      });
      if (f.open_questions?.length) add('open_questions_left', fEntry(e), 'open_questions', `${f.open_questions.length} open question(s) on ${an(f.lifecycle)} feature (${f.open_questions.map((q) => q.id).join(', ')}). Answer them (turn them into decisions), or set the feature back to draft.`);
    }
    if (IN_CODE.has(f.lifecycle)) {
      (f.acceptance ?? []).forEach((a, i) => {
        if (!a.verify) add('acceptance_without_verify', fEntry(e), `acceptance[${i}]`, `Acceptance ${a.id} has no verify: add the command or test that checks it.`);
      });
      if (!f.source_file) add('missing_source_file', fEntry(e), 'source_file', `${an(f.lifecycle).replace(/^a/, 'A')} feature needs source_file: the main file of its implementation (code sync can link it).`);
      else if (owner) {
        const file = path.resolve(owner.project.root, owner.component.codeBasePath ?? owner.component.path, f.source_file);
        if (!exists(file)) add('source_file_not_found', fEntry(e), 'source_file', `${f.source_file} does not exist in ${owner.component.codeBasePath ?? owner.component.path}. Fix the path, or run code sync.`);
      }
    }
    (f.code_refs ?? []).forEach((ref, i) => {
      const project = owner?.project;
      if (!project) return;
      const target = project.components.find((c) => c.slug === ref.component || c.id === ref.component);
      if (!target) {
        add('code_ref_unknown_component', fEntry(e), `code_refs[${i}].component`, `"${ref.component}" is not a component of the project (${project.components.map((c) => c.slug).join(', ')}).`);
        return;
      }
      if (IN_CODE.has(f.lifecycle) && !exists(path.resolve(project.root, target.codeBasePath ?? target.path, ref.file))) {
        add('code_ref_file_not_found', fEntry(e), `code_refs[${i}].file`, `${ref.file} does not exist in ${target.slug} (${target.codeBasePath ?? target.path}). Fix the path.`);
      }
    });
    const operations = e.component && context.operations ? context.operations(e.component) : null;
    if (operations) {
      (f.apis ?? []).forEach((api, i) => {
        if (!operations.has(operationKey(api.method, api.path))) add('api_not_in_openapi', fEntry(e), `apis[${i}]`, `${api.method} ${api.path} is not an operation of the OpenAPI spec of the component. Fix the path, or regenerate the spec.`);
      });
    }
    const actors = owner?.project.actors;
    if (actors?.length) {
      const ids = new Set(actors.map((a) => a.id));
      (f.actors ?? []).forEach((actor, i) => {
        if (!ids.has(actor)) add('unknown_actor', fEntry(e), `actors[${i}]`, `"${actor}" is not an actor of the project (${[...ids].join(', ')}). Use one of them, or add it to actors in product-creator.yml.`);
      });
    }
  }
  // ------------------------------------------------------------------ translations (PRODUCTCREATOR-37)
  const translations = (entry: { kind: IssueKind; id: string; component?: string; file?: string; lifecycle?: Lifecycle | null }, data: unknown, schema: object, project: ProjectModel | undefined) => {
    if (!project) return;
    const languages = projectLanguages(project);
    for (const p of translationProblems(data, schema, languages)) {
      if (p.kind === 'unknown_language') add('translation_unknown_language', entry, `i18n.${p.language}`, `Translations into "${p.language}", which is not a language of the project (${languages.join(', ')}). Add it to languages in product-creator.yml, or remove the translations.`);
      else if (p.kind === 'orphan') add('translation_orphan', entry, `i18n.${p.language}.${p.path}`, `The ${p.language} translation of ${p.path} has no primary text any more (the item was removed or renamed). Remove it, or move it to the new item.`);
      else add('translation_stale', entry, `i18n.${p.language}.${p.path}`, `${p.path} changed after it was translated into ${p.language}. Update the translation (saving it marks it current).`);
    }
  };
  const projectOf = (component?: string) => (component ? owners.get(component)?.project : undefined);
  for (const e of model.features.filter(live)) translations(fEntry(e), e.data, catalogSchemas.feature, projectOf(e.component));
  for (const o of model.objects.filter(live)) translations(oEntry(o), o.data, catalogSchemas.business_object, projectOf(o.component));
  for (const w of model.workflows.filter(live)) translations(wEntry(w), w.data, catalogSchemas.workflow, projectOf(w.component));
  for (const st of streams) translations(sEntry(st), st.data, catalogSchemas.stream, projectOf(st.component));
  for (const project of context.projects) translations({ kind: 'project', id: project.slug, component: project.components[0]?.id }, project, productSchema, project);
  return issues;
}

/** `GET /orders/{id}` and `get /orders/:id` are the same operation */
export function operationKey(method: string, p: string): string {
  return `${method.toUpperCase()} ${p.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\{[^}]+\}/g, '{}').replace(/\/+$/, '') || '/'}`;
}

/** Cycles of a directed graph (strongly connected components with more than one node, or a self-loop), sorted */
export function cycles(nodes: string[], next: (id: string) => string[]): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  const known = new Set(nodes);
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of next(v).filter((x) => known.has(x))) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v) as number, idx.get(w) as number));
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop() as string;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1 || next(v).includes(v)) result.push(scc.sort());
    }
  };
  for (const n of nodes) if (!idx.has(n)) visit(n);
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}
