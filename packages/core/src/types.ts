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
  lifecycle: 'draft' | 'active' | 'deprecated' | 'removed';
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
}

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

export interface GraphEdge {
  source: string;
  target: string;
  event: string;
}

export interface Workflow {
  workflow: string;
  name?: string;
  steps: string[];
  emits?: string[];
  compensations?: Record<string, string>;
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
  lifecycle: 'draft' | 'active' | 'deprecated' | 'removed';
  active?: boolean;
  fields: BusinessObjectField[];
  tables?: BusinessObjectTable[];
  childObjects?: BusinessObject[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  locked?: boolean;
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
