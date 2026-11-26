import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type GenerateEvent, type PcBridge, type WorkspaceInfo } from '../shared/ipc';

const bridge: PcBridge = {
  api: (request) => ipcRenderer.invoke(IPC.api, request),
  workspace: {
    get: () => ipcRenderer.invoke(IPC.workspaceGet),
    openDialog: () => ipcRenderer.invoke(IPC.workspaceOpenDialog),
    add: (root) => ipcRenderer.invoke(IPC.workspaceAdd, root),
    close: (root) => ipcRenderer.invoke(IPC.workspaceClose, root),
  },
  editor: {
    updateProject: (root, patch) => ipcRenderer.invoke(IPC.editorUpdateProject, root, patch),
    saveComponent: (root, component) => ipcRenderer.invoke(IPC.editorSaveComponent, root, component),
    deleteComponent: (root, id) => ipcRenderer.invoke(IPC.editorDeleteComponent, root, id),
    importNew: (root) => ipcRenderer.invoke(IPC.editorImportNew, root),
  },
  openapi: {
    info: (root) => ipcRenderer.invoke(IPC.openapiInfo, root),
    generate: (root, id) => ipcRenderer.invoke(IPC.openapiGenerate, root, id),
    generateAll: (root) => ipcRenderer.invoke(IPC.openapiGenerateAll, root),
    cancel: (id) => ipcRenderer.invoke(IPC.openapiCancel, id),
  },
  onOpenApiEvent: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, event: GenerateEvent) => callback(event);
    ipcRenderer.on(IPC.openapiEvent, listener);
    return () => ipcRenderer.removeListener(IPC.openapiEvent, listener);
  },
  onWorkspaceChanged: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, info: WorkspaceInfo) => callback(info);
    ipcRenderer.on(IPC.workspaceChanged, listener);
    return () => ipcRenderer.removeListener(IPC.workspaceChanged, listener);
  },
};

contextBridge.exposeInMainWorld('pc', bridge);
