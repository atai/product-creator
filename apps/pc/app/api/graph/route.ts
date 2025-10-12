import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';
import { GraphNode, GraphEdge } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const boundedContext = searchParams.get('bounded_context');
    const lifecycle = searchParams.get('lifecycle');

    const storage = await getStorage();
    let functions = storage.getAll();

    // Apply filters
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
        (edge: any) =>
          functionIds.has(edge.source as string) && functionIds.has(edge.target as string)
      )
      .map((edge: any) => ({
        source: edge.source as string,
        target: edge.target as string,
        event: edge.event as string,
      }));

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    logger.error('Failed to fetch graph', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
