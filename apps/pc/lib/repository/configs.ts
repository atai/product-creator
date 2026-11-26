import * as path from 'path';
import { EntityConfig } from './types';
import { FunctionCard, Workflow, Stream, BusinessObject, Project, AppEntity } from '../types';

/**
 * Configuration for FunctionCard repository
 */
export const functionConfig: EntityConfig<FunctionCard> = {
  tableName: 'functions',
  subdirectory: 'functions',

  getIdField: (entity) => entity.id,

  getFileName: (entity) => `${entity.entity}.${entity.action}.yml`,

  getFilePath: (entity, targetRoot, subdirectory) => {
    // Functions need bounded_context in path
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
    filePath,
  }),

  fromRow: (row) => ({
    id: row.id as string,
    name: row.name as string,
    bounded_context: row.bounded_context as string,
    entity: row.entity as string,
    action: row.action as string,
    owner: row.owner as string,
    lifecycle: row.lifecycle as FunctionCard['lifecycle'],
    tags: JSON.parse((row.tags as string) || '[]'),
    emits: JSON.parse((row.emits as string) || '[]'),
    consumes: JSON.parse((row.consumes as string) || '[]'),
    apis: JSON.parse((row.apis as string) || '[]'),
    description: row.description as string,
  }),
};

/**
 * Configuration for Workflow repository
 */
export const workflowConfig: EntityConfig<Workflow> = {
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
    steps: JSON.stringify(entity.steps || []),
    emits: JSON.stringify(entity.emits || []),
    compensations: JSON.stringify(entity.compensations || {}),
    filePath,
  }),

  fromRow: (row) => ({
    workflow: row.workflow as string,
    name: row.name as string,
    steps: JSON.parse((row.steps as string) || '[]'),
    emits: JSON.parse((row.emits as string) || '[]'),
    compensations: JSON.parse((row.compensations as string) || '{}'),
  }),
};

/**
 * Configuration for Stream repository
 */
export const streamConfig: EntityConfig<Stream> = {
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
};

/**
 * Configuration for Business Object repository
 */
export const businessObjectConfig: EntityConfig<BusinessObject> = {
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
};

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
    filePath,
  }),

  fromRow: (row) => ({
    id: row.id as string,
    name: row.name as string,
    projectId: row.projectId as string,
    directory: row.directory as string,
    codeBasePath: row.codeBasePath ? (row.codeBasePath as string) : undefined,
    dbSchemaPath: row.dbSchemaPath ? (row.dbSchemaPath as string) : undefined,
  }),
};
