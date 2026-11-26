import { PrismaModel } from '../prisma/types';
import { BusinessObject } from '../types';
import { loadSyncMapping, SyncMapping } from './mappingStorage';
import * as crypto from 'crypto';

/**
 * Action types for sync operations
 */
export type SyncAction = 'skip' | 'update' | 'create' | 'delete';

/**
 * Status of a matched object
 */
export type MatchStatus = 'new' | 'matched' | 'needs_matching' | 'delete';

/**
 * Result of matching a Prisma model with business objects
 */
export interface MatchedObject {
  prismaModel: PrismaModel;
  businessObject?: BusinessObject;
  action: SyncAction;
  status: MatchStatus;
  businessObjectId?: string;
  changes?: string[]; // List of changed fields
}

/**
 * Match Prisma models with existing business objects
 */
export function matchPrismaToBusinessObjects(
  prismaModels: PrismaModel[],
  existingObjects: BusinessObject[],
  mapping: SyncMapping,
  businessObjectsDirectory: string
): MatchedObject[] {
  const matched: MatchedObject[] = [];
  const usedObjectIds = new Set<string>();

  // Create a map of existing objects by name and id for quick lookup
  const objectsByName = new Map<string, BusinessObject>();
  const objectsById = new Map<string, BusinessObject>();

  existingObjects.forEach((obj) => {
    objectsByName.set(obj.name.toLowerCase(), obj);
    objectsById.set(obj.id.toLowerCase(), obj);
    // Also map by id without dots/underscores for flexible matching
    const normalizedId = obj.id.replace(/[._-]/g, '').toLowerCase();
    objectsById.set(normalizedId, obj);
  });

  // Match each Prisma model
  for (const prismaModel of prismaModels) {
    const modelName = prismaModel.name.toLowerCase();
    let matchedObject: BusinessObject | undefined;
    let action: SyncAction = 'create';
    let status: MatchStatus = 'new';
    let businessObjectId: string | undefined;

    // Check mapping first (for repeated syncs)
    const mappingEntry = mapping[prismaModel.name];
    if (mappingEntry) {
      businessObjectId = mappingEntry.businessObjectId;
      matchedObject = objectsById.get(businessObjectId.toLowerCase());
      
      if (matchedObject) {
        usedObjectIds.add(matchedObject.id);
        // Always check if object has changed, even if found via mapping
        const hasChanges = hasObjectChanged(prismaModel, matchedObject);
        action = hasChanges ? 'update' : 'skip';
        status = hasChanges ? 'needs_matching' : 'matched';
      }
    }

    // If not found in mapping, try to match by name
    if (!matchedObject) {
      // Try exact name match
      matchedObject = objectsByName.get(modelName);
      
      // Try matching by normalized name (remove common prefixes/suffixes)
      if (!matchedObject) {
        const normalizedName = modelName
          .replace(/^model/, '')
          .replace(/model$/, '')
          .trim();
        matchedObject = objectsByName.get(normalizedName);
      }

      // Try matching by id (model name as id)
      if (!matchedObject) {
        matchedObject = objectsById.get(modelName);
      }

      // Try matching by generated ID (e.g., UserRole -> user.role)
      if (!matchedObject) {
        const generatedId = generateObjectIdFromModelName(prismaModel.name);
        matchedObject = objectsById.get(generatedId.toLowerCase());
      }

      // Try matching by normalized generated ID (without dots)
      if (!matchedObject) {
        const generatedId = generateObjectIdFromModelName(prismaModel.name);
        const normalizedGeneratedId = generatedId.replace(/[._-]/g, '').toLowerCase();
        matchedObject = objectsById.get(normalizedGeneratedId);
      }

      if (matchedObject) {
        usedObjectIds.add(matchedObject.id);
        businessObjectId = matchedObject.id;
        
        // Check if object has changed
        const hasChanges = hasObjectChanged(prismaModel, matchedObject);
        action = hasChanges ? 'update' : 'skip';
        status = hasChanges ? 'needs_matching' : 'matched';
      }
    }

    // Determine changes if updating
    const changes = matchedObject && action === 'update'
      ? getObjectChanges(prismaModel, matchedObject)
      : undefined;

    matched.push({
      prismaModel,
      businessObject: matchedObject,
      action,
      status,
      businessObjectId,
      changes,
    });
  }

  // Find objects that should be deleted (exist but not in Prisma schema)
  const existingActiveObjects = existingObjects.filter(
    (obj) => obj.active !== false && !usedObjectIds.has(obj.id)
  );

  for (const obj of existingActiveObjects) {
    // Check if this object was synced from Prisma before
    const wasSynced = Object.values(mapping).some(
      (entry) => entry.businessObjectId === obj.id
    );

    if (wasSynced) {
      matched.push({
        prismaModel: {
          name: obj.name,
          fields: [],
          attributes: [],
        } as PrismaModel,
        businessObject: obj,
        action: 'delete',
        status: 'delete',
        businessObjectId: obj.id,
      });
    }
  }

  return matched;
}

/**
 * Check if a business object has changed compared to Prisma model
 */
function hasObjectChanged(prismaModel: PrismaModel, businessObject: BusinessObject): boolean {
  // Compare structure hash
  const prismaHash = getModelHash(prismaModel);
  const objectHash = getBusinessObjectHash(businessObject);

  return prismaHash !== objectHash;
}

/**
 * Get list of changed fields between Prisma model and business object
 */
function getObjectChanges(prismaModel: PrismaModel, businessObject: BusinessObject): string[] {
  const changes: string[] = [];

  // Compare fields
  const prismaFieldNames = new Set(prismaModel.fields.map((f) => f.name.toLowerCase()));
  const objectFieldNames = new Set(businessObject.fields.map((f) => f.name.toLowerCase()));

  // Fields added in Prisma
  prismaFieldNames.forEach((name) => {
    if (!objectFieldNames.has(name)) {
      changes.push(`Field added: ${name}`);
    }
  });

  // Fields removed from Prisma
  objectFieldNames.forEach((name) => {
    if (!prismaFieldNames.has(name)) {
      changes.push(`Field removed: ${name}`);
    }
  });

  // Compare field types
  const objectFieldsMap = new Map(
    businessObject.fields.map((f) => [f.name.toLowerCase(), f])
  );

  prismaModel.fields.forEach((prismaField) => {
    const objectField = objectFieldsMap.get(prismaField.name.toLowerCase());
    if (objectField) {
      const prismaType = mapPrismaTypeToBusinessType(prismaField.type);
      if (objectField.type !== prismaType) {
        changes.push(`Field type changed: ${prismaField.name} (${objectField.type} → ${prismaType})`);
      }
    }
  });

  // Compare tables
  const prismaTableName = prismaModel.tableName || prismaModel.name.toLowerCase();
  const objectTables = businessObject.tables || [];
  const hasMatchingTable = objectTables.some(
    (table) => table.name.toLowerCase() === prismaTableName.toLowerCase()
  );

  if (!hasMatchingTable && prismaModel.fields.length > 0) {
    changes.push(`Table mapping changed: ${prismaTableName}`);
  }

  return changes;
}

/**
 * Get hash of Prisma model structure
 */
function getModelHash(model: PrismaModel): string {
  const structure = {
    name: model.name,
    fields: model.fields.map((f) => ({
      name: f.name,
      type: f.type,
      optional: f.isOptional,
    })),
    tableName: model.tableName,
  };
  return hashObject(structure);
}

/**
 * Get hash of business object structure
 */
function getBusinessObjectHash(obj: BusinessObject): string {
  const structure = {
    id: obj.id,
    fields: obj.fields.map((f) => ({
      name: f.name,
      type: f.type,
    })),
    tables: (obj.tables || []).map((t) => t.name),
  };
  return hashObject(structure);
}

/**
 * Hash an object for comparison
 */
function hashObject(obj: Record<string, unknown>): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Generate business object ID from Prisma model name
 * Same logic as in syncService.generateObjectId
 */
function generateObjectIdFromModelName(modelName: string): string {
  // Convert ModelName to model.name format (e.g., UserProfile -> user.profile)
  // First, insert dots before capital letters (except the first one)
  let result = modelName.replace(/([A-Z])/g, '.$1').toLowerCase();
  // Remove leading dot if present
  result = result.replace(/^\./, '');
  // Ensure it matches the pattern: ^[a-z0-9_.-]+$
  // Replace any invalid characters
  result = result.replace(/[^a-z0-9_.-]/g, '_');
  return result;
}

/**
 * Map Prisma type to business object type
 */
function mapPrismaTypeToBusinessType(prismaType: string): string {
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

  // Remove optional markers and array brackets
  const cleanType = prismaType.replace(/[!\[\]]/g, '').trim();
  return typeMap[cleanType] || cleanType.toLowerCase();
}

