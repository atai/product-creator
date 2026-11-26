import type { ProjectModel } from '@pc/core/project/model';
import type { ComponentGenerateInfo, GenerateStatus } from '@pc/core/interfaces/generator';

/** Response of an in-process call of the core API (same dispatcher as the UI) */
export interface HostApiResponse {
  status: number;
  body: string;
}

/**
 * What the MCP server needs from the application. The desktop app implements it on top of its
 * Workspace; tests use an in-memory fake. Only projects returned by `projects()` (= folders open
 * in the workspace) are reachable for agents.
 */
export interface McpHost {
  /** Projects open in the workspace (fresh read of the YAML model) */
  projects(): ProjectModel[];
  /** Call a core API route, e.g. `GET /api/index?app=<componentId>` */
  api(request: { method: string; url: string; body?: string }): Promise<HostApiResponse>;
  generation: {
    info(project: ProjectModel): ComponentGenerateInfo[];
    generate(project: ProjectModel, component: ProjectModel['components'][number]): Promise<GenerateStatus>;
    generateAll(project: ProjectModel): Promise<GenerateStatus[]>;
  };
  /** A tool changed project data on disk: the UI should refresh */
  changed?(): void | Promise<void>;
}

export type McpScope = 'read' | 'write';

/** Who is calling: the local token or a bot token of the relay */
export interface Principal {
  /** `local` or `relay:<botTokenId>`; sessions are bound to it */
  id: string;
  kind: 'local' | 'relay';
  /** Effective scope. For a relay caller: the stricter of the bot-token scope and the local scope setting */
  scope: McpScope;
  /** Relay caller only: scope of the bot token as issued in Emperor */
  tokenScope?: McpScope;
  /** Relay caller only: the token allows writes but the local setting is read-only */
  cappedByLocal?: boolean;
  /** Bot User-Agent as reported by the relay (for the action log) */
  userAgent?: string;
}
