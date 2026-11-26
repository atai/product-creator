/** IPC contract between main, preload and renderer */
import type { ComponentInput, ComponentModel, OpenApiGenerate, ProjectModel, ProjectPatch } from '@pc/core/project/model';
import type { ComponentGenerateInfo, GenerateEvent, GenerateStatus } from '@pc/core/interfaces/generator';

export type { ComponentInput, ComponentModel, OpenApiGenerate, ProjectModel, ProjectPatch };
export type { ComponentGenerateInfo, GenerateEvent, GenerateStatus };

export interface ApiRequest {
  method: string;
  /** Path + query, e.g. `/api/index?app=foo` */
  url: string;
  body?: string;
  headers?: Record<string, string>;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface WorkspaceProjectInfo {
  root: string;
  /** Loaded project model (YAML database) */
  project?: ProjectModel;
  /** How the project was obtained on this start: read, imported once from the layout, migrated from v1 */
  origin?: 'read' | 'imported' | 'migrated';
  notes?: string[];
  error?: string;
}

export interface WorkspaceInfo {
  projects: WorkspaceProjectInfo[];
}

/** Result of an editor call: updated workspace or an error message (nothing written) */
export interface EditResult {
  ok: boolean;
  error?: string;
  info: WorkspaceInfo;
}

/** State of the MCP server (settings + runtime) shown on the Settings screen */
export interface McpStatus {
  enabled: boolean;
  scope: 'read' | 'write';
  port: number;
  /** Bearer token of local clients */
  token: string;
  /** URL of the local MCP endpoint (valid while running) */
  url: string;
  running: boolean;
  error?: string;
}

/** State of the remote access through the Emperor relay (PRODUCTCREATOR-20) */
export interface RelayView {
  enabled: boolean;
  url: string;
  hasKey: boolean;
  /** `rld_<deviceId>.••••` — the secret part never reaches the UI */
  keyHint?: string;
  state: 'off' | 'connecting' | 'online' | 'reconnecting' | 'invalid_key' | 'revoked' | 'replaced';
  /** Public MCP URL for bots, while online */
  publicUrl?: string;
  error?: string;
  requests: number;
}

/** One agent call from the action log */
export interface McpActionEntry {
  ts: string;
  principal: string;
  scope?: 'read' | 'write';
  userAgent?: string;
  action: string;
  write?: boolean;
  outcome: 'ok' | 'error' | 'denied';
  durationMs?: number;
  args?: Record<string, unknown>;
  message?: string;
}

export interface PcBridge {
  api(request: ApiRequest): Promise<ApiResponse>;
  workspace: {
    get(): Promise<WorkspaceInfo>;
    openDialog(): Promise<WorkspaceInfo>;
    add(root: string): Promise<WorkspaceInfo>;
    close(root: string): Promise<WorkspaceInfo>;
  };
  /** Project / service / library editor — writes product-creator.yml and *.pc.yml */
  editor: {
    updateProject(root: string, patch: ProjectPatch): Promise<EditResult>;
    saveComponent(root: string, component: ComponentInput): Promise<EditResult>;
    deleteComponent(root: string, id: string): Promise<EditResult>;
    importNew(root: string): Promise<EditResult>;
  };
  /** OpenAPI generation: runs the configured command of a component (child process, streamed log) */
  openapi: {
    info(root: string): Promise<ComponentGenerateInfo[]>;
    generate(root: string, componentId: string): Promise<GenerateStatus>;
    generateAll(root: string): Promise<GenerateStatus[]>;
    cancel(componentId: string): Promise<boolean>;
  };
  /** MCP server settings (PRODUCTCREATOR-18) */
  mcp: {
    status(): Promise<McpStatus>;
    update(patch: { enabled?: boolean; scope?: 'read' | 'write'; port?: number }): Promise<McpStatus>;
    regenerateToken(): Promise<McpStatus>;
    log(): Promise<McpActionEntry[]>;
  };
  onMcpChanged(callback: (status: McpStatus) => void): () => void;
  /** Remote access through the relay (PRODUCTCREATOR-20) */
  relay: {
    status(): Promise<RelayView>;
    update(patch: { enabled?: boolean; url?: string }): Promise<RelayView>;
    setKey(key: string): Promise<RelayView>;
    clearKey(): Promise<RelayView>;
  };
  onRelayChanged(callback: (status: RelayView) => void): () => void;
  onOpenApiEvent(callback: (event: GenerateEvent) => void): () => void;
  onWorkspaceChanged(callback: (info: WorkspaceInfo) => void): () => void;
}

export const IPC = {
  api: 'pc:api',
  workspaceGet: 'pc:workspace:get',
  workspaceOpenDialog: 'pc:workspace:open-dialog',
  workspaceAdd: 'pc:workspace:add',
  workspaceClose: 'pc:workspace:close',
  workspaceChanged: 'pc:workspace:changed',
  editorUpdateProject: 'pc:editor:update-project',
  editorSaveComponent: 'pc:editor:save-component',
  editorDeleteComponent: 'pc:editor:delete-component',
  editorImportNew: 'pc:editor:import-new',
  openapiInfo: 'pc:openapi:info',
  openapiGenerate: 'pc:openapi:generate',
  openapiGenerateAll: 'pc:openapi:generate-all',
  openapiCancel: 'pc:openapi:cancel',
  openapiEvent: 'pc:openapi:event',
  mcpStatus: 'pc:mcp:status',
  mcpUpdate: 'pc:mcp:update',
  mcpRegenerate: 'pc:mcp:regenerate',
  mcpLog: 'pc:mcp:log',
  mcpChanged: 'pc:mcp:changed',
  relayStatus: 'pc:relay:status',
  relayUpdate: 'pc:relay:update',
  relaySetKey: 'pc:relay:set-key',
  relayClearKey: 'pc:relay:clear-key',
  relayChanged: 'pc:relay:changed',
} as const;
