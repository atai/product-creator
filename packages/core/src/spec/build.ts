import * as path from 'path';
import type { ProjectModel, ProductContext } from '../project/model';
import { DEFAULT_SPEC_LANGUAGE } from '../project/model';
import type { BusinessObject, Feature, Workflow } from '../types';
import { validateModel, type CatalogModel, type ValidationIssue } from '../validation/model';

/**
 * The spec of a project as data (PRODUCTCREATOR-35): one model, rendered as the human view (human.ts) and the
 * agent bundle (agent.ts). Validation issues are part of it, next to the entries they belong to: a model with
 * problems never yields a clean-looking spec. Removed entries are left out.
 */
export interface SpecComponent {
  id: string;
  slug: string;
  name: string;
  kind: 'service' | 'library';
}

export interface SpecEntry<T> {
  data: T;
  component: SpecComponent;
  issues: ValidationIssue[];
}

export interface SpecFeature extends SpecEntry<Feature> {
  /** Features of the project that call this one */
  calledBy: string[];
  /** Workflows that have this feature as a step or compensation */
  workflows: string[];
}

export interface SpecObject extends SpecEntry<BusinessObject> {
  usedBy: { id: string; access: 'read' | 'write' }[];
}

export interface SpecModel {
  project: { id: string; slug: string; name: string; description?: string } & Omit<ProductContext, 'spec'>;
  /** Language the catalog is written in (spec.language, default en) */
  language: string;
  components: SpecComponent[];
  features: SpecFeature[];
  objects: SpecObject[];
  workflows: SpecEntry<Workflow>[];
  /** All issues of the project's entries */
  issues: ValidationIssue[];
  counts: { errors: number; warnings: number };
}

const byId = <T extends { data: { id?: string; workflow?: string } }>(a: T, b: T) =>
  String(a.data.id ?? a.data.workflow).localeCompare(String(b.data.id ?? b.data.workflow));

/** `model` may hold several projects (references resolve across them); the spec holds the entries of `project` */
export function buildSpec(project: ProjectModel, model: CatalogModel): SpecModel {
  const components = new Map<string, SpecComponent>(project.components.map((c) => [c.id, { id: c.id, slug: c.slug, name: c.name, kind: c.kind }]));
  // issues of the project's entries; duplicate ids carry files instead of a component
  const inProject = (i: ValidationIssue) => (i.component !== undefined && components.has(i.component)) || (!!i.file && path.resolve(i.file).startsWith(path.resolve(project.root) + path.sep));
  const issues = validateModel(model).filter(inProject);
  const issuesOf = (kind: ValidationIssue['kind'], id: string) => issues.filter((i) => i.kind === kind && i.id === id);
  const mine = <T>(entries: CatalogModel['features' | 'objects' | 'workflows']) =>
    (entries as { data: T; component?: string }[]).filter((e) => e.component && components.has(e.component)) as { data: T; component: string }[];

  const features = mine<Feature>(model.features).filter((e) => e.data.lifecycle !== 'removed');
  const objects = mine<BusinessObject>(model.objects).filter((e) => e.data.lifecycle !== 'removed');
  const workflows = mine<Workflow>(model.workflows).filter((e) => e.data.lifecycle !== 'removed');

  return {
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      vision: project.vision,
      goals: project.goals,
      actors: project.actors,
      glossary: project.glossary,
      tracker: project.tracker,
    },
    language: project.spec?.language ?? DEFAULT_SPEC_LANGUAGE,
    components: [...components.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    features: features
      .map((e) => ({
        data: e.data,
        component: components.get(e.component) as SpecComponent,
        issues: issuesOf('feature', e.data.id),
        calledBy: features.filter((f) => f.data.calls?.includes(e.data.id)).map((f) => f.data.id).sort(),
        workflows: workflows
          .filter((w) => w.data.steps?.includes(e.data.id) || Object.entries(w.data.compensations ?? {}).some(([step, comp]) => step === e.data.id || comp === e.data.id))
          .map((w) => w.data.workflow)
          .sort(),
      }))
      .sort((a, b) => a.data.bounded_context.localeCompare(b.data.bounded_context) || byId(a, b)),
    objects: objects
      .map((e) => ({
        data: e.data,
        component: components.get(e.component) as SpecComponent,
        issues: issuesOf('business_object', e.data.id),
        usedBy: features
          .flatMap((f) => (f.data.objects ?? []).filter((o) => o.id === e.data.id).map((o) => ({ id: f.data.id, access: o.access })))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort(byId),
    workflows: workflows.map((e) => ({ data: e.data, component: components.get(e.component) as SpecComponent, issues: issuesOf('workflow', e.data.workflow) })).sort(byId),
    issues,
    counts: { errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length },
  };
}
