import { getStorage } from '../../../storage';
import type { BusinessObject } from '../../../types';
import {
  getRootObjects,
  groupObjectsByParent,
} from '../../../businessObjects/hierarchy';

export interface BusinessObjectWithChildren extends BusinessObject {
  childObjects?: BusinessObject[];
}

export async function GET(request: Request) {
  try {
    const storage = await getStorage();
    const appId = new URL(request.url).searchParams.get('app');
    const hierarchical = new URL(request.url).searchParams.get('hierarchical') === 'true';

    let businessObjects = storage.getAllBusinessObjects();

    if (appId) {
      const app = storage.getAppById(appId);
      if (app && app.directory) {
        const directory = app.directory;
        const table = storage['store'].getTable('business_objects');
        const filteredIds = Object.entries(table)
          .filter(([, data]: [string, unknown]) => {
            const row = data as Record<string, unknown>;
            const filePath = row.filePath as string | undefined;
            if (!filePath) return false;
            const root = storage.getRootForFilePath(filePath);
            return root === directory;
          })
          .map(([id]) => id);

        businessObjects = businessObjects.filter((bo) => filteredIds.includes(bo.id));
      }
    }

    // If hierarchical mode is requested, group objects by parent
    if (hierarchical) {
      const rootObjects = getRootObjects(businessObjects);
      const grouped = groupObjectsByParent(businessObjects);

      const result: BusinessObjectWithChildren[] = rootObjects.map((obj) => {
        const children = grouped.get(obj.id) || [];
        return {
          ...obj,
          childObjects: children.length > 0 ? children : undefined,
        };
      });

      return Response.json(result);
    }

    return Response.json(businessObjects);
  } catch (error) {
    console.error('Failed to fetch business objects', error);
    return Response.json({ error: 'Failed to fetch business objects' }, { status: 500 });
  }
}




