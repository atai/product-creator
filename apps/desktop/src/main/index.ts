import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import * as path from 'path';
import { IPC, type ApiRequest, type ApiResponse } from '../shared/ipc';
import { parseProjectArgs, defaultProjectFolder } from './args';
import { Workspace } from './workspace';

// File logs of @pc/core go to the user data dir, never into the opened project
process.env.PC_LOG_DIR ??= path.join(app.getPath('userData'), 'logs');

let mainWindow: BrowserWindow | null = null;
const workspace = new Workspace(path.join(app.getPath('userData'), 'workspace.json'));

async function handleApi(request: ApiRequest): Promise<ApiResponse> {
  // Imported lazily so that storage is configured before first use
  const { dispatch } = await import('@pc/core/http/router');
  const hasBody = request.body !== undefined && !['GET', 'HEAD'].includes(request.method.toUpperCase());
  const response = await dispatch(
    new Request(new URL(request.url, 'http://product-creator.local'), {
      method: request.method,
      headers: request.headers,
      body: hasBody ? request.body : undefined,
    })
  );
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  return { status: response.status, headers, body: await response.text() };
}

async function notifyWorkspaceChanged() {
  await workspace.reload();
  mainWindow?.webContents.send(IPC.workspaceChanged, workspace.info());
  updateTitle();
}

function updateTitle() {
  const names = workspace.info().projects.map((p) => p.name ?? path.basename(p.root));
  mainWindow?.setTitle(`Product Creator — ${names.join(', ') || 'no project'}`);
}

async function openFolderDialog() {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open project folder',
    properties: ['openDirectory', 'multiSelections'],
  });
  if (!result.canceled && workspace.add(...result.filePaths)) await notifyWorkspaceChanged();
}

function registerIpc() {
  ipcMain.handle(IPC.api, (_e, request: ApiRequest) => handleApi(request));
  ipcMain.handle(IPC.workspaceGet, () => workspace.info());
  ipcMain.handle(IPC.workspaceOpenDialog, async () => {
    await openFolderDialog();
    return workspace.info();
  });
  ipcMain.handle(IPC.workspaceAdd, async (_e, root: string) => {
    if (workspace.add(root)) await notifyWorkspaceChanged();
    return workspace.info();
  });
  ipcMain.handle(IPC.workspaceClose, async (_e, root: string) => {
    if (workspace.remove(root)) await notifyWorkspaceChanged();
    return workspace.info();
  });
  ipcMain.handle(IPC.workspaceWriteManifest, async (_e, root: string) => {
    workspace.writeManifest(root);
    await notifyWorkspaceChanged();
    return workspace.info();
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Project Folder…', accelerator: 'CmdOrCtrl+O', click: () => void openFolderDialog() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  updateTitle();
}

/**
 * PC_SMOKE_TEST=1: load the workspace, call a few API routes through the same dispatcher as the UI,
 * render the window, save a screenshot (PC_SMOKE_SCREENSHOT) and exit. Used for local/CI verification.
 */
async function runSmokeTest() {
  const report: Record<string, unknown> = { projects: workspace.info().projects.map((p) => ({ root: p.root, services: p.services?.length, error: p.error })) };
  for (const url of ['/api/workspace', '/api/apps', '/api/index', '/api/business-objects', '/api/interfaces']) {
    const res = await handleApi({ method: 'GET', url });
    let size: unknown = res.body.length;
    try {
      const json = JSON.parse(res.body);
      size = Array.isArray(json) ? json.length : Array.isArray(json.apps) ? json.apps.length : Object.keys(json).length;
    } catch {
      /* not JSON */
    }
    report[url] = { status: res.status, size };
  }
  // PC_SMOKE_SYNC_APP=<appId>: run code + schema sync up to the matching stage (nothing is written)
  const syncApp = process.env.PC_SMOKE_SYNC_APP;
  if (syncApp) {
    for (const kind of ['sync-code', 'sync-schema']) {
      const start = JSON.parse((await handleApi({ method: 'POST', url: `/api/apps/${syncApp}/${kind}/start`, body: '{}' })).body);
      let state: { stage?: string; matchedFunctions?: unknown[]; matchedObjects?: unknown[]; progress?: { error?: string } } = {};
      for (let i = 0; i < 120 && start.syncId; i++) {
        await new Promise((r) => setTimeout(r, 500));
        state = JSON.parse((await handleApi({ method: 'GET', url: `/api/apps/${syncApp}/${kind}/status/${start.syncId}` })).body);
        if (state.stage === 'matching' || state.stage === 'error') break;
      }
      report[kind] = { start: start.error ?? 'ok', stage: state.stage, matched: (state.matchedFunctions ?? state.matchedObjects)?.length, error: state.progress?.error };
    }
  }
  const win = mainWindow;
  if (win) {
    if (win.webContents.isLoading()) await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()));
    if (process.env.PC_SMOKE_ROUTE) {
      await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + process.env.PC_SMOKE_ROUTE)}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
    report.rendererText = String(await win.webContents.executeJavaScript('document.body.innerText')).slice(0, 300);
    if (process.env.PC_SMOKE_SCREENSHOT) {
      const image = await win.webContents.capturePage();
      (await import('fs')).writeFileSync(process.env.PC_SMOKE_SCREENSHOT, image.toPNG());
    }
  }
  console.log('PC_SMOKE_RESULT ' + JSON.stringify(report, null, 2));
  app.exit(0);
}

// A second `product-creator <folder>` adds the folder to the running instance
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', async (_e, argv, workingDirectory) => {
    const folders = parseProjectArgs(argv, { ...process.env, INIT_CWD: workingDirectory }, workingDirectory);
    if (folders.length && workspace.add(...folders)) await notifyWorkspaceChanged();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const folders = parseProjectArgs(process.argv);
    if (folders.length) workspace.add(...folders);
    else if (workspace.getRoots().length === 0) workspace.add(defaultProjectFolder());
    await workspace.reload();
    registerIpc();
    buildMenu();
    createWindow();
    if (process.env.PC_SMOKE_TEST) void runSmokeTest();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
