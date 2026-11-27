import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { GraphNode, GraphEdge } from '../../../types';

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const appId = searchParams.get('app');
    const boundedContext = searchParams.get('bounded_context');
    const lifecycle = searchParams.get('lifecycle');

    const storage = await getStorage();
    let functions = storage.getAllFeatures();

    // Apply app filter first
    if (appId) {
      const app = storage.getAppById(appId);
      if (app && app.directory) {
        functions = storage.getFeaturesOfApp(appId);
        logger.info('Filtered graph features by app', { appId, directory: app.directory, count: functions.length });
      }
    }

    // Apply other filters
    if (boundedContext) {
      functions = functions.filter((f) => f.bounded_context === boundedContext);
    }
    if (lifecycle) {
      functions = functions.filter((f) => f.lifecycle === lifecycle);
    }

    // Build nodes
    const nodes: GraphNode[] = functions.map((f) => ({
      id: f.id,
      label: f.name,
      bounded_context: f.bounded_context,
      lifecycle: f.lifecycle,
    }));

    // Get edges from storage
    const allEdges = storage.getEdges();
    const functionIds = new Set(functions.map((f) => f.id));

    // Filter edges to only include those between filtered functions
    const edges: GraphEdge[] = allEdges
      .filter(
        (edge: unknown) => {
          const e = edge as Record<string, unknown>;
          return functionIds.has(e.source as string) && functionIds.has(e.target as string);
        }
      )
      .map((edge: unknown) => {
        const e = edge as Record<string, unknown>;
        return {
          source: e.source as string,
          target: e.target as string,
          event: e.event as string,
        };
      });

    return Response.json({ nodes, edges });
  } catch (error) {
    logger.error('Failed to fetch graph', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
