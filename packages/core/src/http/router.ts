// Generated route table: maps /api/* paths to framework-agnostic handlers (Web Request/Response).
// Used by apps/desktop (IPC) — apps/pc re-exports the same handlers as Next.js route files.
// When adding a route: create routes/<path>/route.ts, add an import + compile() entry here and a re-export stub in apps/pc/app/api.

import * as r_apps__id_ from './routes/apps/[id]/route';
import * as r_apps__id__sync_code_actions from './routes/apps/[id]/sync-code/actions/route';
import * as r_apps__id__sync_code_execute from './routes/apps/[id]/sync-code/execute/route';
import * as r_apps__id__sync_code_start from './routes/apps/[id]/sync-code/start/route';
import * as r_apps__id__sync_code_status__syncId_ from './routes/apps/[id]/sync-code/status/[syncId]/route';
import * as r_apps__id__sync_schema_actions from './routes/apps/[id]/sync-schema/actions/route';
import * as r_apps__id__sync_schema_execute from './routes/apps/[id]/sync-schema/execute/route';
import * as r_apps__id__sync_schema from './routes/apps/[id]/sync-schema/route';
import * as r_apps__id__sync_schema_start from './routes/apps/[id]/sync-schema/start/route';
import * as r_apps__id__sync_schema_status__syncId_ from './routes/apps/[id]/sync-schema/status/[syncId]/route';
import * as r_apps from './routes/apps/route';
import * as r_business_objects from './routes/business-objects/route';
import * as r_card from './routes/card/route';
import * as r_card_root from './routes/card-root/route';
import * as r_graph from './routes/graph/route';
import * as r_index from './routes/index/route';
import * as r_interfaces from './routes/interfaces/route';
import * as r_projects__id_ from './routes/projects/[id]/route';
import * as r_projects from './routes/projects/route';
import * as r_roots from './routes/roots/route';
import * as r_save from './routes/save/route';
import * as r_save_business_object from './routes/save-business-object/route';
import * as r_save_stream from './routes/save-stream/route';
import * as r_save_workflow from './routes/save-workflow/route';
import * as r_stream from './routes/stream/route';
import * as r_streams from './routes/streams/route';
import * as r_validate from './routes/validate/route';
import * as r_workflow from './routes/workflow/route';
import * as r_workflows from './routes/workflows/route';
import * as r_workspace from './routes/workspace/route';

export type RouteHandler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
type RouteModule = Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', RouteHandler>>;

interface RouteEntry {
  pattern: string;
  regex: RegExp;
  keys: string[];
  module: RouteModule;
}

function compile(pattern: string, module: RouteModule): RouteEntry {
  const keys: string[] = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      const m = /^\[(\w+)\]$/.exec(segment);
      if (m) {
        keys.push(m[1]);
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { pattern, regex: new RegExp(`^/api/${source}/?$`), keys, module };
}

// Static routes first so that e.g. /api/apps is not shadowed by /api/apps/[id]
export const routes: RouteEntry[] = [
  compile('apps', r_apps as RouteModule),
  compile('business-objects', r_business_objects as RouteModule),
  compile('card', r_card as RouteModule),
  compile('card-root', r_card_root as RouteModule),
  compile('graph', r_graph as RouteModule),
  compile('index', r_index as RouteModule),
  compile('interfaces', r_interfaces as RouteModule),
  compile('projects', r_projects as RouteModule),
  compile('roots', r_roots as RouteModule),
  compile('save', r_save as RouteModule),
  compile('save-business-object', r_save_business_object as RouteModule),
  compile('save-stream', r_save_stream as RouteModule),
  compile('save-workflow', r_save_workflow as RouteModule),
  compile('stream', r_stream as RouteModule),
  compile('streams', r_streams as RouteModule),
  compile('validate', r_validate as RouteModule),
  compile('workflow', r_workflow as RouteModule),
  compile('workflows', r_workflows as RouteModule),
  compile('workspace', r_workspace as RouteModule),
  compile('apps/[id]', r_apps__id_ as RouteModule),
  compile('apps/[id]/sync-code/actions', r_apps__id__sync_code_actions as RouteModule),
  compile('apps/[id]/sync-code/execute', r_apps__id__sync_code_execute as RouteModule),
  compile('apps/[id]/sync-code/start', r_apps__id__sync_code_start as RouteModule),
  compile('apps/[id]/sync-schema', r_apps__id__sync_schema as RouteModule),
  compile('apps/[id]/sync-schema/actions', r_apps__id__sync_schema_actions as RouteModule),
  compile('apps/[id]/sync-schema/execute', r_apps__id__sync_schema_execute as RouteModule),
  compile('apps/[id]/sync-schema/start', r_apps__id__sync_schema_start as RouteModule),
  compile('projects/[id]', r_projects__id_ as RouteModule),
  compile('apps/[id]/sync-code/status/[syncId]', r_apps__id__sync_code_status__syncId_ as RouteModule),
  compile('apps/[id]/sync-schema/status/[syncId]', r_apps__id__sync_schema_status__syncId_ as RouteModule),
];

/** Dispatch a Web Request to the matching handler (404/405 when nothing matches) */
export async function dispatch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  for (const route of routes) {
    const match = route.regex.exec(url.pathname);
    if (!match) continue;
    const handler = route.module[request.method.toUpperCase() as keyof RouteModule];
    if (!handler) return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => (params[key] = decodeURIComponent(match[i + 1])));
    return handler(request, { params: Promise.resolve(params) });
  }
  return Response.json({ error: `No route for ${url.pathname}` }, { status: 404 });
}
