import { getStorage } from '../../../storage';

export async function GET(request: Request) {
  try {
    const storage = await getStorage();
    const appId = new URL(request.url).searchParams.get('app');

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

    return Response.json(workflows);
  } catch (error) {
    console.error('Failed to fetch workflows', error);
    return Response.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}
