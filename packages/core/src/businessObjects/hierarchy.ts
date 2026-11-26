import { BusinessObject } from '../types';

/**
 * Check if an object ID represents a child object (has parent.child pattern)
 */
export function isChildObject(objectId: string): boolean {
  return objectId.includes('.');
}

/**
 * Get parent ID from child object ID
 * Examples:
 * - "user.role" -> "user"
 * - "user.profile.settings" -> "user.profile" (if exists) or "user"
 */
export function getParentId(childId: string): string | null {
  if (!isChildObject(childId)) {
    return null;
  }

  const parts = childId.split('.');
  if (parts.length < 2) {
    return null;
  }

  // Return the first part as parent
  return parts[0];
}

/**
 * Find the most specific parent ID that exists in the objects list
 * For "user.profile.settings", checks:
 * 1. "user.profile" (if exists)
 * 2. "user" (if exists)
 */
export function findParentId(
  childId: string,
  allObjects: BusinessObject[]
): string | null {
  if (!isChildObject(childId)) {
    return null;
  }

  const parts = childId.split('.');
  const objectIds = new Set(allObjects.map((obj) => obj.id));

  // Try to find the most specific parent (longest match)
  for (let i = parts.length - 1; i > 0; i--) {
    const candidateParentId = parts.slice(0, i).join('.');
    if (objectIds.has(candidateParentId)) {
      return candidateParentId;
    }
  }

  return null;
}

/**
 * Group objects by parent
 * Returns a Map where key is parent ID and value is array of child objects
 */
export function groupObjectsByParent(
  objects: BusinessObject[]
): Map<string, BusinessObject[]> {
  const grouped = new Map<string, BusinessObject[]>();

  for (const obj of objects) {
    if (!isChildObject(obj.id)) {
      continue;
    }

    const parentId = findParentId(obj.id, objects);
    if (parentId) {
      if (!grouped.has(parentId)) {
        grouped.set(parentId, []);
      }
      grouped.get(parentId)!.push(obj);
    }
  }

  return grouped;
}

/**
 * Get only root objects (objects that are not children of other objects)
 */
export function getRootObjects(objects: BusinessObject[]): BusinessObject[] {
  const childIds = new Set<string>();

  // Mark all child objects
  for (const obj of objects) {
    if (isChildObject(obj.id)) {
      const parentId = findParentId(obj.id, objects);
      if (parentId) {
        childIds.add(obj.id);
      }
    }
  }

  // Return only objects that are not children
  return objects.filter((obj) => !childIds.has(obj.id));
}

/**
 * Get child objects for a specific parent
 */
export function getChildObjects(
  parentId: string,
  allObjects: BusinessObject[]
): BusinessObject[] {
  return allObjects.filter((obj) => {
    if (!isChildObject(obj.id)) {
      return false;
    }
    const objParentId = findParentId(obj.id, allObjects);
    return objParentId === parentId;
  });
}

/**
 * Check if an object has child objects
 */
export function hasChildObjects(
  objectId: string,
  allObjects: BusinessObject[]
): boolean {
  return getChildObjects(objectId, allObjects).length > 0;
}

