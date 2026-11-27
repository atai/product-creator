import * as fs from 'fs';
import * as path from 'path';
import logger from '../logger';

/**
 * Structure of sync mapping file
 */
export interface SyncMapping {
  [prismaModelName: string]: {
    businessObjectId: string;
    action: 'skip' | 'update' | 'create' | 'delete' | 'link' | 'unlink';
    lastSync: number; // timestamp
  };
}

/**
 * Get the path to the sync mapping file
 */
function getMappingFilePath(businessObjectsDirectory: string): string {
  return path.join(businessObjectsDirectory, '.sync-mapping.json');
}

/**
 * Load sync mapping from file
 */
export function loadSyncMapping(businessObjectsDirectory: string): SyncMapping {
  const mappingPath = getMappingFilePath(businessObjectsDirectory);
  
  logger.info('Loading sync mapping', { 
    businessObjectsDirectory, 
    mappingPath, 
    exists: fs.existsSync(mappingPath) 
  });
  
  if (!fs.existsSync(mappingPath)) {
    logger.info('Sync mapping file does not exist', { mappingPath });
    return {};
  }

  try {
    const content = fs.readFileSync(mappingPath, 'utf-8');
    const mapping = JSON.parse(content) as SyncMapping;
    logger.info('Sync mapping loaded', { 
      mappingPath, 
      entryCount: Object.keys(mapping).length 
    });
    return mapping;
  } catch (error) {
    logger.error('Failed to load sync mapping', { error, mappingPath });
    return {};
  }
}

/**
 * Save sync mapping to file
 */
export function saveSyncMapping(
  businessObjectsDirectory: string,
  mapping: SyncMapping
): void {
  const mappingPath = getMappingFilePath(businessObjectsDirectory);
  
  logger.info('Saving sync mapping', { 
    businessObjectsDirectory, 
    mappingPath, 
    entryCount: Object.keys(mapping).length 
  });
  
  // Ensure directory exists
  const dir = path.dirname(mappingPath);
  if (!fs.existsSync(dir)) {
    logger.info('Creating mapping directory', { dir });
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf-8');
    logger.info('Sync mapping saved successfully', { mappingPath });
  } catch (error) {
    logger.error('Failed to save sync mapping', { error, mappingPath, businessObjectsDirectory });
    throw error;
  }
}

/**
 * Update a single mapping entry
 */
export function updateMappingEntry(
  businessObjectsDirectory: string,
  prismaModelName: string,
  businessObjectId: string,
  action: 'skip' | 'update' | 'create' | 'delete' | 'link' | 'unlink'
): void {
  logger.info('Updating mapping entry', { 
    businessObjectsDirectory, 
    prismaModelName, 
    businessObjectId, 
    action 
  });
  
  const mapping = loadSyncMapping(businessObjectsDirectory);
  mapping[prismaModelName] = {
    businessObjectId,
    action,
    lastSync: Date.now(),
  };
  saveSyncMapping(businessObjectsDirectory, mapping);
}

/**
 * Get mapping entry for a Prisma model
 */
export function getMappingEntry(
  businessObjectsDirectory: string,
  prismaModelName: string
): { businessObjectId: string; action: string; lastSync: number } | null {
  const mapping = loadSyncMapping(businessObjectsDirectory);
  return mapping[prismaModelName] || null;
}

