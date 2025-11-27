import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';

export async function GET(request: NextRequest) {
  try {
    const storage = await getStorage();
    const appId = request.nextUrl.searchParams.get('app');

    let workflows = storage.getAllWorkflows();

    if (appId) {
      const app = storage.getAppById(appId);
      if (app && app.directory) {
        const directory = app.directory;
        const workflowsTable = storage['store'].getTable('workflows');
        const filteredIds = Object.entries(workflowsTable)
          .filter(([, data]: [string, unknown]) => {
            const row = data as Record<string, unknown>;
            const filePath = row.filePath as string | undefined;
            if (!filePath) return false;
            const root = storage.getRootForFilePath(filePath);
            return root === directory;
          })
          .map(([id]) => id);

        workflows = workflows.filter(workflow => filteredIds.includes(workflow.workflow));
      }
    }

    return NextResponse.json(workflows);
  } catch (error) {
    console.error('Failed to fetch workflows', error);
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}
