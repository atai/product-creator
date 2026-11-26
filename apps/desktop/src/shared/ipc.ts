/** IPC contract between main, preload and renderer */

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
  id?: string;
  name?: string;
  source?: 'file' | 'discovered';
  services?: { id: string; name: string; path: string; catalog: string; openapi?: string[]; dbSchemaPath?: string }[];
  error?: string;
}

export interface WorkspaceInfo {
  projects: WorkspaceProjectInfo[];
}

export interface PcBridge {
  api(request: ApiRequest): Promise<ApiResponse>;
  workspace: {
    get(): Promise<WorkspaceInfo>;
    openDialog(): Promise<WorkspaceInfo>;
    add(root: string): Promise<WorkspaceInfo>;
    close(root: string): Promise<WorkspaceInfo>;
    /** Write product-creator.yml for a discovered project */
    writeManifest(root: string): Promise<WorkspaceInfo>;
  };
  onWorkspaceChanged(callback: (info: WorkspaceInfo) => void): () => void;
}

export const IPC = {
  api: 'pc:api',
  workspaceGet: 'pc:workspace:get',
  workspaceOpenDialog: 'pc:workspace:open-dialog',
  workspaceAdd: 'pc:workspace:add',
  workspaceClose: 'pc:workspace:close',
  workspaceWriteManifest: 'pc:workspace:write-manifest',
  workspaceChanged: 'pc:workspace:changed',
} as const;
