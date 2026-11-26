import { ExportedFunction } from '../code/types';
import { FunctionCard } from '../types';
import { loadSyncMapping, SyncMapping } from './mappingStorage';
import logger from '../logger';

/**
 * Action types for sync operations
 */
export type SyncAction = 'skip' | 'update' | 'create' | 'delete';

/**
 * Status of a matched function
 */
export type MatchStatus = 'new' | 'matched' | 'needs_matching' | 'delete';

/**
 * Result of matching an exported function with existing function cards
 */
export interface MatchedFunction {
  exportedFunction: ExportedFunction;
  functionCard?: FunctionCard;
  action: SyncAction;
  status: MatchStatus;
  functionId?: string;
  changes?: string[]; // List of changed fields
}

/**
 * Match exported functions with existing function cards
 */
export function matchCodeToFunctions(
  exportedFunctions: ExportedFunction[],
  existingFunctions: FunctionCard[],
  mapping: SyncMapping,
  functionsDirectory: string
): MatchedFunction[] {
  const matched: MatchedFunction[] = [];
  const usedFunctionIds = new Set<string>();

  const normalizeKey = (value?: string | null): string | null => {
    if (!value || typeof value !== 'string') return null;
    return value.toLowerCase();
  };

  // Create a map of existing functions by name and id for quick lookup
  const functionsByName = new Map<string, FunctionCard>();
  const functionsById = new Map<string, FunctionCard>();
  const functionsBySourceFile = new Map<string, FunctionCard>();

  existingFunctions.forEach((func) => {
    const normalizedName = normalizeKey(func.name);
    const normalizedId = normalizeKey(func.id);
    const normalizedSource = normalizeKey(func.source_file);

    if (normalizedName) {
      functionsByName.set(normalizedName, func);
    } else {
      logger.warn('Function without name encountered during matching', { id: func.id });
    }

    if (normalizedId) {
      functionsById.set(normalizedId, func);
    } else {
      logger.warn('Function without ID encountered during matching', { name: func.name });
    }

    if (normalizedSource) {
      functionsBySourceFile.set(normalizedSource, func);
    }
  });

  // Match each exported function
  for (const exportedFunc of exportedFunctions) {
    const funcName = normalizeKey(exportedFunc.name);
    if (!funcName) {
      logger.warn('Exported function without name encountered', { relativePath: exportedFunc.relativePath });
      continue;
    }
    let matchedFunction: FunctionCard | undefined;
    let action: SyncAction = 'create';
    let status: MatchStatus = 'new';
    let functionId: string | undefined;

    // Try to generate function ID from file path and function name
    // Format: context.entity.action
    const generatedId = generateFunctionId(exportedFunc);

    // Check mapping first (for repeated syncs)
    const mappingKey = `${exportedFunc.relativePath}:${exportedFunc.name}`;
    const mappingEntry = mapping[mappingKey];
    if (mappingEntry) {
      functionId = mappingEntry.businessObjectId; // Reusing the same mapping structure
      const normalizedMappingId = normalizeKey(functionId);
      matchedFunction = normalizedMappingId ? functionsById.get(normalizedMappingId) : undefined;
      
      if (matchedFunction) {
        usedFunctionIds.add(matchedFunction.id);
        action = mappingEntry.action as SyncAction;
        status = action === 'skip' ? 'matched' : 'needs_matching';
      }
    }

    // If not found in mapping, try to match by source file
    if (!matchedFunction && exportedFunc.relativePath) {
      const normalizedPath = normalizeKey(exportedFunc.relativePath);
      matchedFunction = normalizedPath ? functionsBySourceFile.get(normalizedPath) : undefined;
      if (matchedFunction) {
        // Check if function name matches
        const normalizedMatchedName = normalizeKey(matchedFunction.name);
        if (normalizedMatchedName === funcName) {
          usedFunctionIds.add(matchedFunction.id);
          functionId = matchedFunction.id;
          
          // Check if function has changed
          const hasChanges = hasFunctionChanged(exportedFunc, matchedFunction);
          action = hasChanges ? 'update' : 'skip';
          status = hasChanges ? 'needs_matching' : 'matched';
        } else {
          matchedFunction = undefined;
        }
      }
    }

    // Try matching by generated ID
    if (!matchedFunction && generatedId) {
      const normalizedGeneratedId = normalizeKey(generatedId);
      matchedFunction = normalizedGeneratedId ? functionsById.get(normalizedGeneratedId) : undefined;
      if (matchedFunction) {
        usedFunctionIds.add(matchedFunction.id);
        functionId = matchedFunction.id;
        
        const hasChanges = hasFunctionChanged(exportedFunc, matchedFunction);
        action = hasChanges ? 'update' : 'skip';
        status = hasChanges ? 'needs_matching' : 'matched';
      }
    }

    // Try matching by name
    if (!matchedFunction) {
      matchedFunction = functionsByName.get(funcName);
      if (matchedFunction) {
        usedFunctionIds.add(matchedFunction.id);
        functionId = matchedFunction.id;
        
        const hasChanges = hasFunctionChanged(exportedFunc, matchedFunction);
        action = hasChanges ? 'update' : 'skip';
        status = hasChanges ? 'needs_matching' : 'matched';
      }
    }

    // If still no match, use generated ID
    if (!functionId && generatedId) {
      functionId = generatedId;
    }

    // Determine changes if updating
    const changes = matchedFunction && action === 'update'
      ? getFunctionChanges(exportedFunc, matchedFunction)
      : undefined;

    matched.push({
      exportedFunction: exportedFunc,
      functionCard: matchedFunction,
      action,
      status,
      functionId,
      changes,
    });
  }

  // Find functions that should be deleted (exist but not in code)
  // Only delete if they were synced from code before (have source_file)
  const existingCodeFunctions = existingFunctions.filter(
    (func) => func.source_file && !usedFunctionIds.has(func.id)
  );

  for (const func of existingCodeFunctions) {
    // Check if this function was synced from code before
    const wasSynced = Object.values(mapping).some(
      (entry) => entry.businessObjectId === func.id
    );

    if (wasSynced || func.source_file) {
      matched.push({
        exportedFunction: {
          name: func.name,
          filePath: '',
          relativePath: func.source_file || '',
          lineNumber: 0,
          isDefault: false,
          isAsync: false,
          parameters: [],
        },
        functionCard: func,
        action: 'delete',
        status: 'delete',
        functionId: func.id,
      });
    }
  }

  return matched;
}

/**
 * Generate function ID from exported function
 * Format: context.entity.action
 * Tries to extract from file path structure
 */
function generateFunctionId(exportedFunc: ExportedFunction): string | null {
  // Try to extract from file path: e.g., src/context/entity/action.ts -> context.entity.action
  const pathParts = exportedFunc.relativePath
    .replace(/\.ts$/, '')
    .split(/[/\\]/)
    .filter((p) => p && p !== 'src' && p !== 'lib' && p !== 'app');

  if (pathParts.length >= 3) {
    // Assume format: context/entity/action.ts
    const context = pathParts[pathParts.length - 3];
    const entity = pathParts[pathParts.length - 2];
    const action = pathParts[pathParts.length - 1];
    return `${context}.${entity}.${action}`;
  } else if (pathParts.length === 2) {
    // Format: context/entity.ts, use function name as action
    const context = pathParts[pathParts.length - 2];
    const entity = pathParts[pathParts.length - 1];
    const action = exportedFunc.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return `${context}.${entity}.${action}`;
  } else if (pathParts.length === 1) {
    // Single level, try to split filename
    const fileName = pathParts[0];
    const parts = fileName.split('.');
    if (parts.length >= 2) {
      return parts.join('.');
    }
  }

  // Fallback: use function name and try to infer
  const funcName = exportedFunc.name.toLowerCase();
  // Try camelCase to dot notation: createUser -> create.user (if entity can be inferred)
  // For now, return null and let the system generate a default
  return null;
}

/**
 * Check if a function has changed compared to exported function
 */
function hasFunctionChanged(exportedFunc: ExportedFunction, functionCard: FunctionCard): boolean {
  // Compare source file
  if (exportedFunc.relativePath !== functionCard.source_file) {
    return true;
  }

  // Compare name
  if (exportedFunc.name !== functionCard.name) {
    return true;
  }

  // Note: We don't compare body text as it changes frequently
  // We mainly care about structural changes (name, file location)

  return false;
}

/**
 * Get list of changed fields between exported function and function card
 */
function getFunctionChanges(exportedFunc: ExportedFunction, functionCard: FunctionCard): string[] {
  const changes: string[] = [];

  if (exportedFunc.relativePath !== functionCard.source_file) {
    changes.push(`Source file changed: ${functionCard.source_file} → ${exportedFunc.relativePath}`);
  }

  if (exportedFunc.name !== functionCard.name) {
    changes.push(`Name changed: ${functionCard.name} → ${exportedFunc.name}`);
  }

  return changes;
}

