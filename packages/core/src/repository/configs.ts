import * as path from 'path';
import { EntityConfig } from './types';
import { Feature, Workflow, Stream, BusinessObject, Project, AppEntity, type Lifecycle } from '../types';

/** Catalog folder of features (PRODUCTCREATOR-28) */
export const FEATURES_DIR = 'features';
/** Old folder name, still read so that existing catalogs keep working; `migrateFeatureFolders` moves it */
export const LEGACY_FEATURES_DIR = 'functions';

/**
 * Catalog cards keep every field: fields without their own row column (spec fields of PRODUCTCREATOR-32, workflow
 * lifecycle, tickets, … and any field added later) go to the `extra` JSON column, so reading a card and saving it
 * back never drops a field (PRODUCTCREATOR-33).
 */
function keepAllFields<T extends object>(config: EntityConfig<T>): EntityConfig<T> {
  return {
    ...config,
    toRow: (entity, filePath) => {
      const row = config.toRow(entity, filePath);
      const extra = Object.fromEntries(Object.entries(entity).filter(([k, v]) => !(k in row) && v !== undefined));
      return Object.keys(extra).length ? { ...row, extra: JSON.stringify(extra) } : row;
    },
    // columns first, then the other fields in their saved order: a card read and saved back keeps id, name … on top
    fromRow: (row) => ({ ...config.fromRow(row), ...(row.extra ? (JSON.parse(row.extra as string) as Partial<T>) : {}) }),
  };
}

/**
 * Configuration for the Feature repository
 */
export const featureConfig: EntityConfig<Feature> = keepAllFields({
  tableName: 'features',
  subdirectory: FEATURES_DIR,

  getIdField: (entity) => entity.id,

  getFileName: (entity) => `${entity.entity}.${entity.action}.yml`,

  getFilePath: (entity, targetRoot, subdirectory) => {
    // Features need bounded_context in path
    return path.resolve(
      targetRoot,
      subdirectory,
      entity.bounded_context,
      `${entity.entity}.${entity.action}.yml`
    );
  },

  validateRequired: (entity) => {
    if (!entity.id) {
      return 'Missing required field: id';
    }
    if (!entity.bounded_context || !entity.entity || !entity.action) {
      return 'Missing required fields: bounded_context, entity, or action';
    }
    return null;
  },

  toRow: (entity, filePath) => ({
    id: entity.id,
    name: entity.name,
    bounded_context: entity.bounded_context,
    entity: entity.entity,
    action: entity.action,
    owner: entity.owner,
    lifecycle: entity.lifecycle,
    tags: JSON.stringify(entity.tags || []),
    emits: JSON.stringify(entity.emits || []),
    consumes: JSON.stringify(entity.consumes || []),
    apis: JSON.stringify(entity.apis || []),
    description: entity.description || '',
    // optional link fields: kept in the row so that reading a card and saving it back does not drop them
    ...(entity.source_file ? { source_file: entity.source_file } : {}),
    ...(entity.calls?.length ? { calls: JSON.stringify(entity.calls) } : {}),
    ...(entity.objects?.length ? { objects: JSON.stringify(entity.objects) } : {}),
    filePath,
  }),

  fromRow: (row) => ({
    id: row.id as string,
    name: row.name as string,
    bounded_context: row.bounded_context as string,
    entity: row.entity as string,
    action: row.action as string,
    owner: row.owner as string,
    lifecycle: row.lifecycle as Feature['lifecycle'],
    tags: JSON.parse((row.tags as string) || '[]'),
    emits: JSON.parse((row.emits as string) || '[]'),
    consumes: JSON.parse((row.consumes as string) || '[]'),
    apis: JSON.parse((row.apis as string) || '[]'),
    description: row.description as string,
    ...(row.source_file ? { source_file: row.source_file as string } : {}),
    ...(row.calls ? { calls: JSON.parse(row.calls as string) as string[] } : {}),
    ...(row.objects ? { objects: JSON.parse(row.objects as string) as Feature['objects'] } : {}),
  }),
});

/**
 * Configuration for Workflow repository
 */
export const workflowConfig: EntityConfig<Workflow> = keepAllFields({
  tableName: 'workflows',
  subdirectory: 'workflows',

  getIdField: (entity) => entity.workflow,

  getFileName: (entity) => `${entity.workflow}.yml`,

  validateRequired: (entity) => {
    if (!entity.workflow) {
      return 'Missing required field: workflow';
    }
    return null;
  },

  toRow: (entity, filePath) => ({
    workflow: entity.workflow,
    name: entity.name || '',
    // a card without lifecycle stays without it (validation reports it), nothing is invented on read
    ...(entity.lifecycle ? { lifecycle: entity.lifecycle } : {}),
    steps: JSON.stringify(entity.steps || []),
    emits: JSON.stringify(entity.emits || []),
    compensations: JSON.stringify(entity.compensations || {}),
    filePath,
  }),

  fromRow: (row) => ({
    workflow: row.workflow as string,
    name: row.name as string,
    lifecycle: row.lifecycle as Lifecycle,
    steps: JSON.parse((row.steps as string) || '[]'),
    emits: JSON.parse((row.emits as string) || '[]'),
    compensations: JSON.parse((row.compensations as string) || '{}'),
  }),
});

/**
 * Configuration for Stream repository
 */
export const streamConfig: EntityConfig<Stream> = keepAllFields({
  tableName: 'streams',
  subdirectory: 'streams',

  getIdField: (entity) => entity.stream,

  getFileName: (entity) => `${entity.stream}.yml`,

  validateRequired: (entity) => {
    if (!entity.stream) {
      return 'Missing required field: stream';
    }
    if (!entity.goal) {
      return 'Missing required field: goal';
    }
    return null;
  },

  toRow: (entity, filePath) => ({
    stream: entity.stream,
    name: entity.name || '',
    goal: entity.goal || '',
    kpis: JSON.stringify(entity.kpis || []),
    stages: JSON.stringify(entity.stages || []),
    rules: JSON.stringify(entity.rules || {}),
    filePath,
  }),

  fromRow: (row) => ({
    stream: row.stream as string,
    name: row.name as string,
    goal: row.goal as string,
    kpis: JSON.parse((row.kpis as string) || '[]'),
    stages: JSON.parse((row.stages as string) || '[]'),
    rules: JSON.parse((row.rules as string) || '{}'),
  }),
});

/**
 * Configuration for Business Object repository
 */
export const businessObjectConfig: EntityConfig<BusinessObject> = keepAllFields({
  tableName: 'business_objects',
  subdirectory: 'business-objects',

  getIdField: (entity) => entity.id,

  getFileName: (entity) => `${entity.id}.yml`,

  validateRequired: (entity) => {
    if (!entity.id) {
      return 'Missing required field: id';
    }
    if (!entity.name) {
      return 'Missing required field: name';
    }
    if (!entity.owner) {
      return 'Missing required field: owner';
    }
    if (!entity.lifecycle) {
      return 'Missing required field: lifecycle';
    }
    if (!Array.isArray(entity.fields)) {
      return 'Fields must be an array';
    }
    return null;
  },

  toRow: (entity, filePath) => ({
    id: entity.id,
    name: entity.name,
    owner: entity.owner,
    lifecycle: entity.lifecycle,
    description: entity.description || '',
    active: entity.active !== undefined ? entity.active : true,
    fields: JSON.stringify(entity.fields || []),
    tables: JSON.stringify(entity.tables || []),
    filePath,
  }),

  fromRow: (row) => ({
    id: row.id as string,
    name: row.name as string,
    owner: row.owner as string,
    lifecycle: row.lifecycle as BusinessObject['lifecycle'],
    description: (row.description as string) || '',
    active: row.active !== undefined ? (row.active as boolean) : true,
    fields: JSON.parse((row.fields as string) || '[]'),
    tables: JSON.parse((row.tables as string) || '[]'),
  }),
});

/**
 * Configuration for Project repository
 */
export const projectConfig: EntityConfig<Project> = {
  tableName: 'projects',
  subdirectory: 'projects',

  getIdField: (entity) => entity.id,

  getFileName: (entity) => `${entity.id}.yml`,

  validateRequired: (entity) => {
    if (!entity.id) {
      return 'Missing required field: id';
    }
    if (!entity.name) {
      return 'Missing required field: name';
    }
    if (!/^[a-z]{5}$/.test(entity.id)) {
      return 'Project ID must be 5 lowercase letters';
    }
    return null;
  },

  toRow: (entity, filePath) => ({
    id: entity.id,
    name: entity.name,
    description: entity.description || '',
    filePath,
  }),

  fromRow: (row) => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description ? (row.description as string) : undefined,
  }),
};

/**
 * Configuration for App repository
 */
export const appConfig: EntityConfig<AppEntity> = {
  tableName: 'apps',
  subdirectory: 'apps',

  getIdField: (entity) => entity.id,

  getFileName: (entity) => `${entity.id}.yml`,

  validateRequired: (entity) => {
    if (!entity.id) {
      return 'Missing required field: id';
    }
    if (!entity.name) {
      return 'Missing required field: name';
    }
    if (!entity.projectId) {
      return 'Missing required field: projectId';
    }
    if (!entity.directory) {
      return 'Missing required field: directory';
    }
    if (!/^[a-z]{5}-[a-z]{3}$/.test(entity.id)) {
      return 'App ID must match <projectId>-<suffix> format with lowercase letters';
    }
    return null;
  },

  toRow: (entity, filePath) => ({
    id: entity.id,
    name: entity.name,
    projectId: entity.projectId,
    directory: entity.directory,
    codeBasePath: entity.codeBasePath || '',
    dbSchemaPath: entity.dbSchemaPath || '',
    openapi: JSON.stringify(entity.openapi || []),
    servicePath: entity.servicePath || '',
    filePath,
  }),

  fromRow: (row) => ({
    id: row.id as string,
    name: row.name as string,
    projectId: row.projectId as string,
    directory: row.directory as string,
    codeBasePath: row.codeBasePath ? (row.codeBasePath as string) : undefined,
    dbSchemaPath: row.dbSchemaPath ? (row.dbSchemaPath as string) : undefined,
    openapi: row.openapi && row.openapi !== '[]' ? (JSON.parse(row.openapi as string) as string[]) : undefined,
    servicePath: row.servicePath ? (row.servicePath as string) : undefined,
  }),
};
