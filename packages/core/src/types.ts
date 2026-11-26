export interface FunctionCard {
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
}

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
