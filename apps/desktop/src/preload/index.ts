import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type PcBridge, type WorkspaceInfo } from '../shared/ipc';

const bridge: PcBridge = {
  api: (request) => ipcRenderer.invoke(IPC.api, request),
  workspace: {
    get: () => ipcRenderer.invoke(IPC.workspaceGet),
    openDialog: () => ipcRenderer.invoke(IPC.workspaceOpenDialog),
    add: (root) => ipcRenderer.invoke(IPC.workspaceAdd, root),
    close: (root) => ipcRenderer.invoke(IPC.workspaceClose, root),
    writeManifest: (root) => ipcRenderer.invoke(IPC.workspaceWriteManifest, root),
  },
  onWorkspaceChanged: (callback) => {
    const listener = (_e: Electron.IpcRendererEvent, info: WorkspaceInfo) => callback(info);
    ipcRenderer.on(IPC.workspaceChanged, listener);
    return () => ipcRenderer.removeListener(IPC.workspaceChanged, listener);
  },
};

contextBridge.exposeInMainWorld('pc', bridge);
