import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';

export async function GET(request: NextRequest) {
  try {
    const storage = await getStorage();
    const rootFilter = request.nextUrl.searchParams.get('root');

    let businessObjects = storage.getAllBusinessObjects();

    if (rootFilter) {
      const table = storage['store'].getTable('business_objects');
      const filteredIds = Object.entries(table)
        .filter(([, data]: [string, unknown]) => {
          const row = data as Record<string, unknown>;
          const filePath = row.filePath as string | undefined;
          if (!filePath) return false;
          const root = storage.getRootForFilePath(filePath);
          return root === rootFilter;
        })
        .map(([id]) => id);

      businessObjects = businessObjects.filter((bo) => filteredIds.includes(bo.id));
    }

    return NextResponse.json(businessObjects);
  } catch (error) {
    console.error('Failed to fetch business objects', error);
    return NextResponse.json({ error: 'Failed to fetch business objects' }, { status: 500 });
  }
}




