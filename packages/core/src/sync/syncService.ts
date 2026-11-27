import { parsePrismaSchema } from '../prisma/parser';
import { PrismaModel } from '../prisma/types';
import { BusinessObject, BusinessObjectField, BusinessObjectTable, BusinessObjectTableColumn } from '../types';
import { matchPrismaToBusinessObjects, MatchedObject, SyncAction } from './matcher';
import { loadSyncMapping, saveSyncMapping, updateMappingEntry } from './mappingStorage';
import { getStorage } from '../storage';
import * as path from 'path';
import * as fs from 'fs';
import logger from '../logger';

/**
 * Sync stage
 */
export type SyncStage = 'loading' | 'matching' | 'executing' | 'completed' | 'error';

/**
 * Progress callback
 */
export type ProgressCallback = (progress: SyncProgress) => void;

/**
 * Sync progress information
 */
export interface SyncProgress {
  stage: SyncStage;
  current: number;
  total: number;
  message?: string;
  matchedObjects?: MatchedObject[];
  error?: string;
}

/**
 * Sync state stored in memory (for status polling)
 */
interface SyncState {
  syncId: string;
  appId: string;
  stage: SyncStage;
  progress: SyncProgress;
  matchedObjects: MatchedObject[];
  actions: Map<string, SyncAction>; // Map of prismaModelName -> action
  createdAt: number;
  updatedAt: number;
}

// In-memory storage for sync states
// Use global object so in-flight sync state survives module reloads in tests/dev
declare global {
  var __syncStates: Map<string, SyncState> | undefined;
}

const getSyncStatesMap = (): Map<string, SyncState> => {
  if (!global.__syncStates) {
    global.__syncStates = new Map<string, SyncState>();
  }
  return global.__syncStates;
};

/**
 * Schema Sync Service
 */
export class SchemaSyncService {
  private appId: string;
  private dbSchemaPath: string;
  private businessObjectsDirectory: string;
  private syncId: string;

  constructor(appId: string, dbSchemaPath: string, businessObjectsDirectory: string, syncId: string) {
    this.appId = appId;
    this.dbSchemaPath = dbSchemaPath;
    this.businessObjectsDirectory = businessObjectsDirectory;
    this.syncId = syncId;
  }

  /**
   * Load and parse Prisma schema
   */
  async loadSchema(progressCallback?: ProgressCallback): Promise<PrismaModel[]> {
    try {
      progressCallback?.({
        stage: 'loading',
        current: 0,
        total: 1,
        message: 'Reading Prisma schema file...',
      });

      // Resolve schema path
      const schemaPath = path.isAbsolute(this.dbSchemaPath)
        ? this.dbSchemaPath
        : path.resolve(process.cwd(), this.dbSchemaPath);

      if (!fs.existsSync(schemaPath)) {
        throw new Error(`Prisma schema file not found: ${schemaPath}`);
      }

      progressCallback?.({
        stage: 'loading',
        current: 0.5,
        total: 1,
        message: 'Parsing Prisma schema...',
      });

      const models = await parsePrismaSchema(schemaPath);

      progressCallback?.({
        stage: 'loading',
        current: 1,
        total: 1,
        message: `Found ${models.length} models`,
      });

      return models;
    } catch (error) {
      logger.error('Failed to load Prisma schema', { error, appId: this.appId });
      throw error;
    }
  }

  /**
   * Match Prisma models with existing business objects
   */
  async matchObjects(
    prismaModels: PrismaModel[],
    progressCallback?: ProgressCallback
  ): Promise<MatchedObject[]> {
    try {
      progressCallback?.({
        stage: 'matching',
        current: 0,
        total: prismaModels.length,
        message: 'Loading existing business objects...',
      });

      const storage = await getStorage();
      const existingObjects = storage.getAllBusinessObjects().filter((obj) => {
        // Filter by app directory
        const table = storage['store'].getTable('business_objects');
        const row = table[obj.id];
        if (!row || !row.filePath) return false;
        const root = storage.getRootForFilePath(row.filePath as string);
        return root === this.businessObjectsDirectory;
      });

      progressCallback?.({
        stage: 'matching',
        current: 0.5,
        total: prismaModels.length,
        message: 'Loading sync mapping...',
      });

      const mapping = loadSyncMapping(this.businessObjectsDirectory);

      progressCallback?.({
        stage: 'matching',
        current: 1,
        total: prismaModels.length,
        message: 'Matching objects...',
      });

      const matched = matchPrismaToBusinessObjects(
        prismaModels,
        existingObjects,
        mapping,
        this.businessObjectsDirectory
      );

      progressCallback?.({
        stage: 'matching',
        current: prismaModels.length,
        total: prismaModels.length,
        message: `Matched ${matched.length} objects`,
        matchedObjects: matched,
      });

      return matched;
    } catch (error) {
      logger.error('Failed to match objects', { error, appId: this.appId });
      throw error;
    }
  }

  /**
   * Execute sync actions
   */
  async executeSync(
    matchedObjects: MatchedObject[],
    actions: Map<string, SyncAction>,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    try {
      await getStorage();
      const total = matchedObjects.length;
      let current = 0;

      for (const matched of matchedObjects) {
        const modelName = matched.prismaModel.name;
        const action = actions.get(modelName) || matched.action;

        current++;
        progressCallback?.({
          stage: 'executing',
          current,
          total,
          message: `Processing ${modelName} (${action})...`,
        });

        try {
          switch (action) {
            case 'create':
              await this.createBusinessObject(matched.prismaModel);
              updateMappingEntry(
                this.businessObjectsDirectory,
                modelName,
                matched.businessObjectId || this.generateObjectId(matched.prismaModel),
                'create'
              );
              break;

            case 'update':
              if (matched.businessObject) {
                await this.updateBusinessObject(matched.prismaModel, matched.businessObject);
                updateMappingEntry(
                  this.businessObjectsDirectory,
                  modelName,
                  matched.businessObject.id,
                  'update'
                );
              }
              break;

            case 'delete':
              if (matched.businessObject) {
                await this.deleteBusinessObject(matched.businessObject);
                // Remove from mapping
                const mapping = loadSyncMapping(this.businessObjectsDirectory);
                delete mapping[modelName];
                saveSyncMapping(this.businessObjectsDirectory, mapping);
              }
              break;

            case 'skip':
              // No action needed, but update lastSync timestamp
              if (matched.businessObject) {
                updateMappingEntry(
                  this.businessObjectsDirectory,
                  modelName,
                  matched.businessObject.id,
                  'skip'
                );
              }
              break;
          }
        } catch (error) {
          logger.error(`Failed to ${action} object ${modelName}`, { error });
          // Continue with next object
        }
      }

      progressCallback?.({
        stage: 'completed',
        current: total,
        total,
        message: 'Synchronization completed',
      });
    } catch (error) {
      logger.error('Failed to execute sync', { error, appId: this.appId });
      throw error;
    }
  }

  /**
   * Create business object from Prisma model
   */
  private async createBusinessObject(prismaModel: PrismaModel): Promise<void> {
    try {
      const storage = await getStorage();
      const businessObject = this.convertPrismaModelToBusinessObject(prismaModel);
      const result = await storage.saveBusinessObject(businessObject, this.businessObjectsDirectory);
      if (!result.success) {
        throw new Error(result.error || `Failed to save business object ${businessObject.id}`);
      }
    } catch (error) {
      logger.error(`Failed to create business object from Prisma model ${prismaModel.name}`, { error });
      throw error;
    }
  }

  /**
   * Update existing business object from Prisma model
   */
  private async updateBusinessObject(
    prismaModel: PrismaModel,
    existingObject: BusinessObject
  ): Promise<void> {
    try {
      const storage = await getStorage();
      const updatedObject = this.convertPrismaModelToBusinessObject(prismaModel, existingObject);
      const result = await storage.saveBusinessObject(updatedObject, this.businessObjectsDirectory);
      if (!result.success) {
        throw new Error(result.error || `Failed to update business object ${updatedObject.id}`);
      }
    } catch (error) {
      logger.error(`Failed to update business object from Prisma model ${prismaModel.name}`, { error });
      throw error;
    }
  }

  /**
   * Delete business object (set active: false)
   */
  private async deleteBusinessObject(businessObject: BusinessObject): Promise<void> {
    try {
      const storage = await getStorage();
      const deletedObject: BusinessObject = {
        ...businessObject,
        active: false,
      };
      const result = await storage.saveBusinessObject(deletedObject, this.businessObjectsDirectory);
      if (!result.success) {
        throw new Error(result.error || `Failed to delete business object ${businessObject.id}`);
      }
    } catch (error) {
      logger.error(`Failed to delete business object ${businessObject.id}`, { error });
      throw error;
    }
  }

  /**
   * Convert Prisma model to Business Object
   */
  private convertPrismaModelToBusinessObject(
    prismaModel: PrismaModel,
    existing?: BusinessObject
  ): BusinessObject {
    // Ensure we have at least one field
    if (!prismaModel.fields || prismaModel.fields.length === 0) {
      throw new Error(`Prisma model ${prismaModel.name} has no fields`);
    }

    const fields: BusinessObjectField[] = prismaModel.fields
      .filter((field) => {
        // Filter out invalid fields
        if (!field.name || !field.type) return false;
        // Filter out relation fields (fields with types starting with uppercase that are not scalars)
        // These are Prisma relations, not actual database columns
        const isRelationField = field.type[0] === field.type[0].toUpperCase() && 
                                field.type !== 'String' && 
                                field.type !== 'Int' && 
                                field.type !== 'Float' && 
                                field.type !== 'Boolean' && 
                                field.type !== 'DateTime' && 
                                field.type !== 'Date' && 
                                field.type !== 'Json' && 
                                field.type !== 'Bytes' && 
                                field.type !== 'BigInt' && 
                                field.type !== 'Decimal';
        // Include relation fields only if they are arrays (many-to-many or one-to-many)
        // These represent actual relationships that should be documented
        return !isRelationField || field.isList;
      })
      .map((field) => {
        let type = this.mapPrismaTypeToBusinessType(field.type).trim();
        // If field is a list, append [] to the type
        if (field.isList) {
          type = `${type}[]`;
        }
        return {
          name: field.name.trim(),
          type,
          description: (field.documentation || field.attributes.find((a) => a.name === '@description')?.args?.[0] || '').trim() || undefined,
        };
      });

    // Ensure we have at least one valid field
    if (fields.length === 0) {
      throw new Error(`Prisma model ${prismaModel.name} has no valid fields`);
    }

    const tableName = prismaModel.tableName || prismaModel.name.toLowerCase();
    const columns: BusinessObjectTableColumn[] = prismaModel.fields
      .filter((field) => {
        // Only include scalar fields and foreign key fields (relation fields with @relation)
        if (!field.name || !field.type) return false;
        // Exclude relation fields that are not foreign keys (they don't have @relation with fields)
        const isRelationField = field.type[0] === field.type[0].toUpperCase() && 
                                field.type !== 'String' && 
                                field.type !== 'Int' && 
                                field.type !== 'Float' && 
                                field.type !== 'Boolean' && 
                                field.type !== 'DateTime' && 
                                field.type !== 'Date' && 
                                field.type !== 'Json' && 
                                field.type !== 'Bytes' && 
                                field.type !== 'BigInt' && 
                                field.type !== 'Decimal';
        // Include relation fields only if they have @relation attribute with fields (foreign keys)
        if (isRelationField) {
          const relationAttr = field.attributes.find((a) => a.name === '@relation');
          if (relationAttr && relationAttr.args) {
            // Check if it has fields parameter (foreign key)
            const hasFields = relationAttr.args.some((arg, idx) => 
              idx > 0 && relationAttr.args![idx - 1] === 'fields'
            );
            return hasFields;
          }
          return false;
        }
        return true;
      })
      .map((field) => {
        const mapAttr = field.attributes.find((a) => a.name === '@map');
        const columnName = mapAttr?.args?.[0] || field.name;

        return {
          name: columnName.trim(),
          type: this.mapPrismaTypeToDatabaseType(field.type).trim(),
          description: (field.documentation || '').trim() || undefined,
        };
      });

    const tables: BusinessObjectTable[] = [
      {
        name: tableName.trim(),
        description: (prismaModel.documentation || `Table for ${prismaModel.name} model`).trim() || undefined,
        columns: columns.length > 0 ? columns : undefined,
      },
    ];

    const objectId = existing?.id || this.generateObjectId(prismaModel);
    const objectName = existing?.name || this.generateObjectName(prismaModel);

    // Validate required fields
    if (!objectId || !objectId.match(/^[a-z0-9_.-]+$/)) {
      throw new Error(`Invalid business object ID generated: ${objectId} (from model: ${prismaModel.name})`);
    }
    if (!objectName || objectName.trim().length === 0) {
      throw new Error(`Invalid business object name generated: ${objectName} (from model: ${prismaModel.name})`);
    }

    // Use Prisma model documentation as description (if available)
    // If description field doesn't exist in business object, add it from documentation
    const description = prismaModel.documentation 
      ? prismaModel.documentation.trim() 
      : existing?.description?.trim() || undefined;

    return {
      id: objectId,
      name: objectName.trim(),
      description: description || undefined,
      owner: (existing?.owner || 'System').trim(),
      lifecycle: existing?.lifecycle || 'draft',
      active: existing?.active !== undefined ? existing.active : true,
      fields,
      tables: tables.length > 0 ? tables : undefined,
    };
  }

  /**
   * Generate business object ID from Prisma model
   * Uses the model name as-is in lowercase, without adding dots
   * Dots are only used for child objects (table parts) which are created separately
   */
  private generateObjectId(model: PrismaModel): string {
    // Convert ModelName to modelname (lowercase, no dots)
    // Only replace invalid characters, keep the name structure intact
    let result = model.name.toLowerCase();
    // Replace any invalid characters with underscores
    result = result.replace(/[^a-z0-9_.-]/g, '_');
    // Ensure it matches the pattern: ^[a-z0-9_.-]+$
    return result;
  }

  /**
   * Generate business object name from Prisma model
   */
  private generateObjectName(model: PrismaModel): string {
    // Convert ModelName to "Model Name" format
    return model.name
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^./, (c) => c.toUpperCase());
  }

  /**
   * Map Prisma type to business object type
   */
  private mapPrismaTypeToBusinessType(prismaType: string): string {
    const cleanType = prismaType.replace(/[![\]]/g, '').trim();
    const typeMap: Record<string, string> = {
      String: 'string',
      Int: 'integer',
      BigInt: 'integer',
      Float: 'decimal',
      Decimal: 'decimal',
      Boolean: 'boolean',
      DateTime: 'datetime',
      Date: 'date',
      Json: 'json',
      Bytes: 'bytes',
    };
    // If it's a scalar type, use the mapped value
    if (typeMap[cleanType]) {
      return typeMap[cleanType];
    }
    // For relation types (model names), convert to lowercase
    // e.g., RevenueStream -> revenuestream
    return cleanType.toLowerCase();
  }

  /**
   * Map Prisma type to database column type
   */
  private mapPrismaTypeToDatabaseType(prismaType: string): string {
    const cleanType = prismaType.replace(/[![\]]/g, '').trim();
    const typeMap: Record<string, string> = {
      String: 'varchar(255)',
      Int: 'integer',
      BigInt: 'bigint',
      Float: 'double precision',
      Decimal: 'decimal(10,2)',
      Boolean: 'boolean',
      DateTime: 'timestamp',
      Date: 'date',
      Json: 'jsonb',
      Bytes: 'bytea',
    };
    return typeMap[cleanType] || cleanType.toLowerCase();
  }
}

/**
 * Create a new sync state
 */
export function createSyncState(
  appId: string,
  _dbSchemaPath: string,
  _businessObjectsDirectory: string
): string {
  const syncId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const state: SyncState = {
    syncId,
    appId,
    stage: 'loading',
    progress: {
      stage: 'loading',
      current: 0,
      total: 1,
    },
    matchedObjects: [],
    actions: new Map(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const statesMap = getSyncStatesMap();
  statesMap.set(syncId, state);
  return syncId;
}

/**
 * Get sync state
 */
export function getSyncState(syncId: string): SyncState | null {
  const statesMap = getSyncStatesMap();
  return statesMap.get(syncId) || null;
}

/**
 * Update sync state
 */
export function updateSyncState(syncId: string, updates: Partial<SyncState>): void {
  const statesMap = getSyncStatesMap();
  const state = statesMap.get(syncId);
  if (state) {
    Object.assign(state, updates);
    state.updatedAt = Date.now();
  }
}

/**
 * Delete sync state
 */
export function deleteSyncState(syncId: string): void {
  const statesMap = getSyncStatesMap();
  statesMap.delete(syncId);
}

