/**
 * Lifecycle of a feature or business object (PRODUCTCREATOR-32). Each status has its own rules (PRODUCTCREATOR-34):
 * draft — being worked out; approved — spec agreed, ready to build; implemented — in the code;
 * deprecated — still in the code, not for new work; removed — gone from the code, kept for history.
 */
export const LIFECYCLES = ['draft', 'approved', 'implemented', 'deprecated', 'removed'] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

/**
 * Feature: a business capability of the product (PRODUCTCREATOR-28; formerly "function card").
 * Stored in `<catalog>/features/<bounded_context>/<entity>.<action>.yml`; the old folder `functions/` is still read.
 * The implementation in code is `source_file` (file) and `calls` (features used by that code).
 */
export interface Feature {
  id: string;
  name: string;
  bounded_context: string;
  entity: string;
  action: string;
  owner: string;
  lifecycle: Lifecycle;
  tags?: string[];
  emits?: string[];
  consumes?: string[];
  apis?: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
  }[];
  description?: string;
  calls?: string[];
  source_file?: string;
  /** Business objects the feature uses (PRODUCTCREATOR-29); each id must be a business object of the catalog */
  objects?: FeatureObjectRef[];
  // Spec fields (PRODUCTCREATOR-32): what the feature must do. Item ids are local to the feature (R1, A1, …)
  /** Who uses the feature: roles of people or systems */
  actors?: string[];
  requirements?: FeatureRequirement[];
  acceptance?: FeatureAcceptance[];
  constraints?: FeatureConstraint[];
  decisions?: FeatureDecision[];
  open_questions?: FeatureQuestion[];
  /** Other places of the implementation, in this or another component (PRODUCTCREATOR-33) */
  code_refs?: FeatureCodeRef[];
  /** Tracker issues, e.g. PRODUCTCREATOR-34 */
  tickets?: string[];
  /** Screenshots of the UI for the spec (PRODUCTCREATOR-36) */
  screens?: FeatureScreen[];
  /** Translations: i18n.<language> (PRODUCTCREATOR-37) */
  i18n?: Translations;
}

/** i18n block of a card: language → translated fields (+ _source fingerprints) */
export type Translations = Record<string, Record<string, unknown>>;

/** One step before a screenshot: exactly one of click / fill / wait */
export interface FeatureScreenAction {
  click?: string;
  fill?: [string, string];
  wait?: string;
}

export interface FeatureScreen {
  /** S1, S2, … */
  id: string;
  title: string;
  /** Route or URL path relative to screenshots.baseUrl */
  path: string;
  wait?: string;
  actions?: FeatureScreenAction[];
  element?: string;
  viewport?: [number, number];
}

export interface FeatureCodeRef {
  /** Component slug or id */
  component: string;
  /** Relative to the codeBasePath of that component */
  file: string;
  symbol?: string;
  /** e.g. UI, API, CLI */
  role?: string;
}

export interface FeatureRequirement {
  /** R1, R2, … */
  id: string;
  text: string;
  /** MoSCoW; default must */
  priority?: 'must' | 'should' | 'could';
}

/** Acceptance criterion: given/when/then, or text */
export interface FeatureAcceptance {
  /** A1, A2, … */
  id: string;
  /** Requirement ids this criterion checks */
  covers?: string[];
  given?: string;
  when?: string;
  then?: string;
  text?: string;
  /** Command or test reference that verifies the criterion */
  verify?: string;
}

export interface FeatureConstraint {
  /** C1, C2, … */
  id: string;
  kind?: 'performance' | 'security' | 'reliability' | 'compatibility' | 'usability' | 'compliance' | 'other';
  text: string;
}

export interface FeatureDecision {
  /** D1, D2, … */
  id: string;
  decision: string;
  reason?: string;
  /** YYYY-MM-DD */
  date?: string;
  /** default accepted */
  status?: 'accepted' | 'superseded';
}

export interface FeatureQuestion {
  /** Q1, Q2, … */
  id: string;
  question: string;
  owner?: string;
}

/** Spec lists of a feature, in the order they appear in a spec */
export const FEATURE_SPEC_LISTS = ['requirements', 'acceptance', 'constraints', 'decisions', 'open_questions', 'screens'] as const;
export type FeatureSpecList = (typeof FEATURE_SPEC_LISTS)[number];

export interface FeatureObjectRef {
  /** Business object id */
  id: string;
  /** read: only reads the object; write: creates, changes or deletes it */
  access: 'read' | 'write';
}

/** @deprecated renamed to {@link Feature} (PRODUCTCREATOR-28); kept for one version */
export type FunctionCard = Feature;

export interface GraphNode {
  id: string;
  label: string;
  bounded_context: string;
  lifecycle: string;
}

/** Edge of the feature graph: a feature calls another, a workflow goes from one step to the next, or an event links emitter and consumer */
export interface GraphEdge {
  source: string;
  target: string;
  kind: 'calls' | 'workflow' | 'event';
  /** Event name (event), workflow key (workflow), empty for calls */
  label: string;
}

export interface Workflow {
  workflow: string;
  name?: string;
  description?: string;
  /** PRODUCTCREATOR-33: a planned workflow is draft like a feature */
  lifecycle: Lifecycle;
  steps: string[];
  emits?: string[];
  compensations?: Record<string, string>;
  tickets?: string[];
  i18n?: Translations;
}

export interface StreamStage {
  name: string;
  entry_events: string[];
  exit_events: string[];
  workflows?: string[];
}

export interface Stream {
  stream: string;
  name?: string;
  goal: string;
  kpis?: string[];
  stages: StreamStage[];
  rules?: {
    unique_function_per_stage?: boolean;
  };
}

export interface BusinessObjectField {
  name: string;
  type: string;
  description?: string;
}

export interface BusinessObjectTableColumn {
  name: string;
  type: string;
  description?: string;
}

export interface BusinessObjectTable {
  name: string;
  description?: string;
  columns?: BusinessObjectTableColumn[];
}

export interface BusinessObject {
  id: string;
  name: string;
  description?: string;
  owner: string;
  lifecycle: Lifecycle;
  active?: boolean;
  fields: BusinessObjectField[];
  tables?: BusinessObjectTable[];
  childObjects?: BusinessObject[];
  tickets?: string[];
  /** PRODUCTCREATOR-39: entity (default, stored) | value (structure inside other objects) | computed (not stored) */
  kind?: BusinessObjectKind;
  /** Features that produce a computed object */
  computedBy?: string[];
  i18n?: Translations;
}

export const BUSINESS_OBJECT_KINDS = ['entity', 'value', 'computed'] as const;
export type BusinessObjectKind = (typeof BUSINESS_OBJECT_KINDS)[number];
/** Kind of an object; a card without `kind` is an entity */
export const kindOf = (o: { kind?: BusinessObjectKind }): BusinessObjectKind => o.kind ?? 'entity';

export interface Project {
  id: string;
  name: string;
  description?: string;
  locked?: boolean;
  /** Absolute project root (desktop mode) */
  root?: string;
}

export interface AppEntity {
  id: string;
  name: string;
  projectId: string;
  directory: string;
  codeBasePath?: string;
  dbSchemaPath?: string;
  /** OpenAPI specs of the service (absolute paths in desktop mode) */
  openapi?: string[];
  /** Service directory relative to the project root (desktop mode) */
  servicePath?: string;
}
