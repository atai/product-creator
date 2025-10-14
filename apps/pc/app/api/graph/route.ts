import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';
import { GraphNode, GraphEdge } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rootFilter = searchParams.get('root');
    const boundedContext = searchParams.get('bounded_context');
    const lifecycle = searchParams.get('lifecycle');

    const storage = await getStorage();
    let functions = storage.getAll();

    // Apply root filter first
    if (rootFilter) {
      const functionsTable = storage['store'].getTable('functions');
      const filteredIds = Object.entries(functionsTable)
        .filter(([, data]: [string, unknown]) => {
          const row = data as Record<string, unknown>;
          const root = storage.getRootForFilePath(row.filePath as string);
          return root === rootFilter;
        })
        .map(([id]) => id);

      functions = functions.filter(f => filteredIds.includes(f.id));
      logger.info('Filtered graph functions by root', { rootFilter, count: functions.length });
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

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    logger.error('Failed to fetch graph', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
