import { getStorage } from '../../../storage';
import logger from '../../../logger';
import { GraphNode, GraphEdge } from '../../../types';

/**
 * GET /api/graph?app=&bounded_context=&lifecycle=: features and the links between them (PRODUCTCREATOR-35):
 * calls, consecutive workflow steps and events (emits → consumes). Only edges between the returned features.
 */
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const appId = searchParams.get('app');
    const boundedContext = searchParams.get('bounded_context');
    const lifecycle = searchParams.get('lifecycle');

    const storage = await getStorage();
    let features = appId && storage.getAppById(appId)?.directory ? storage.getFeaturesOfApp(appId) : storage.getAllFeatures();
    if (boundedContext) features = features.filter((f) => f.bounded_context === boundedContext);
    if (lifecycle) features = features.filter((f) => f.lifecycle === lifecycle);

    const nodes: GraphNode[] = features.map((f) => ({ id: f.id, label: f.name, bounded_context: f.bounded_context, lifecycle: f.lifecycle }));
    const ids = new Set(features.map((f) => f.id));
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    const add = (edge: GraphEdge) => {
      const key = `${edge.kind}|${edge.source}|${edge.target}|${edge.label}`;
      if (edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target) || seen.has(key)) return;
      seen.add(key);
      edges.push(edge);
    };

    for (const f of features) for (const target of f.calls ?? []) add({ source: f.id, target, kind: 'calls', label: '' });
    for (const w of storage.getAllWorkflows()) {
      const steps = Array.isArray(w.steps) ? w.steps : [];
      for (let i = 1; i < steps.length; i++) add({ source: steps[i - 1], target: steps[i], kind: 'workflow', label: w.workflow });
    }
    for (const e of storage.getEdges()) {
      const edge = e as Record<string, unknown>;
      add({ source: String(edge.source), target: String(edge.target), kind: 'event', label: String(edge.event ?? '') });
    }

    return Response.json({ nodes, edges });
  } catch (error) {
    logger.error('Failed to fetch graph', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
