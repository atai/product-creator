import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, screen, shell } from 'electron';
import { mkdirSync } from 'fs';
import * as path from 'path';
import { deleteComponent, importNewComponents, readProject, saveComponent, updateProject, type ProjectModel } from '@pc/core/project/model';
import { loginShellPath, OpenApiGenerationManager } from '@pc/core/interfaces/generator';
import { migrateProject, summarizeMigration } from '@pc/core/catalog/migrate';
import { IPC, type ApiRequest, type ApiResponse, type ComponentInput, type EditResult, type ProjectPatch } from '../shared/ipc';
import { parseProjectArgs, defaultProjectFolder } from './args';
import { Workspace } from './workspace';
import { checkForUpdatesInteractive, startAutoUpdates } from './updater';
import { resolveUserDataDir } from './userData';
import { DEFAULT_MCP_PORT, DEFAULT_MCP_PORT_DEV, SettingsStore } from './settings';
import { McpController } from './mcp';
import { RelayController } from './relay';
import { attachMacMultiDisplayResizeGuard } from './resizeGuard';

// Settings and data folder. Must run before anything reads userData and before the single-instance lock:
// a development run (not packaged) uses '<appData>/Product Creator Dev' and never touches the installed
// build's '<appData>/Product Creator' (PC_USER_DATA_DIR overrides, for tests).
const userDataDir = resolveUserDataDir({
  isPackaged: app.isPackaged,
  appData: app.getPath('appData'),
  hasUserDataSwitch: app.commandLine.hasSwitch('user-data-dir'),
});
if (userDataDir) app.setPath('userData', userDataDir);
mkdirSync(app.getPath('userData'), { recursive: true });

// File logs of @pc/core go to the user data dir, never into the opened project
process.env.PC_LOG_DIR ??= path.join(app.getPath('userData'), 'logs');

let mainWindow: BrowserWindow | null = null;
const workspace = new Workspace(path.join(app.getPath('userData'), 'workspace.json'));

/** BrowserWindow after `closed` is still a JS object; reading webContents throws. */
function liveWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow;
}

function send(channel: string, payload: unknown) {
  const win = liveWindow();
  if (!win) return;
  win.webContents.send(channel, payload);
}

// GUI-launched apps (Dock/Finder) miss the shell PATH (pnpm, node): resolve it once from the login shell
let shellPath: string | undefined;
const generation = new OpenApiGenerationManager({ env: () => (shellPath ? { PATH: shellPath } : undefined) });
generation.onEvent((event) => send(IPC.openapiEvent, event));

// MCP server for agents (PRODUCTCREATOR-18): off unless enabled in the settings; reachable projects = open workspace
const settings = new SettingsStore(
  path.join(app.getPath('userData'), 'settings.json'),
  { mcpPort: app.isPackaged ? DEFAULT_MCP_PORT : DEFAULT_MCP_PORT_DEV },
  // the relay device key is encrypted with the OS keychain (safeStorage); never stored in plain text
  {
    available: () => app.isReady() && safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (encrypted) => safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
  }
);
let workspaceChangedTimer: NodeJS.Timeout | undefined;
const mcp = new McpController(
  settings,
  {
    projects: () => workspace.info().projects.flatMap((p) => (p.project ? [p.project] : [])),
    api: (request) => handleApi({ method: request.method, url: request.url, body: request.body, headers: { 'content-type': 'application/json' } }),
    generation,
    // data was written by an agent: let the UI re-read (debounced, a sync may report several writes)
    changed: () => {
      clearTimeout(workspaceChangedTimer);
      workspaceChangedTimer = setTimeout(() => void notifyWorkspaceChanged(), 400);
    },
  },
  app.getVersion(),
  path.join(app.getPath('userData'), 'mcp-actions.log')
);
mcp.onChange(() => send(IPC.mcpChanged, mcp.status()));
// "Expose remotely": tunnel to the Emperor MCP relay (PRODUCTCREATOR-20)
const relay = new RelayController(settings, mcp, app.getVersion(), (message) => console.log(message));
relay.onChange(() => send(IPC.relayChanged, relay.status()));

async function shutdown() {
  clearTimeout(workspaceChangedTimer);
  generation.cancelAll();
  relay.stop();
  await mcp.stop();
}

function projectAt(root: string): ProjectModel {
  const project = readProject(workspace.requireRoot(root));
  if (!project) throw new Error(`No project model in ${root}`);
  return project;
}

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
  send(IPC.workspaceChanged, workspace.info());
  updateTitle();
}

function updateTitle() {
  const win = liveWindow();
  if (!win) return;
  const names = workspace.info().projects.map((p) => p.project?.name ?? path.basename(p.root));
  win.setTitle(`Product Creator — ${names.join(', ') || 'no project'}`);
}

async function openFolderDialog() {
  const options: Electron.OpenDialogOptions = {
    title: 'Open project folder',
    properties: ['openDirectory', 'multiSelections'],
  };
  const win = liveWindow();
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
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

  // MCP server settings
  ipcMain.handle(IPC.mcpStatus, () => mcp.status());
  ipcMain.handle(IPC.mcpUpdate, async (_e, patch: { enabled?: boolean; scope?: 'read' | 'write'; port?: number }) => {
    settings.updateMcp(patch);
    await mcp.apply();
    return mcp.status();
  });
  ipcMain.handle(IPC.mcpRegenerate, async () => {
    settings.regenerateMcpToken();
    await mcp.apply();
    return mcp.status();
  });
  ipcMain.handle(IPC.mcpLog, () => mcp.audit.recent(100));

  // Remote access through the relay
  ipcMain.handle(IPC.relayStatus, () => relay.status());
  ipcMain.handle(IPC.relayUpdate, (_e, patch: { enabled?: boolean; url?: string }) => {
    settings.updateRelay(patch);
    relay.apply();
    return relay.status();
  });
  ipcMain.handle(IPC.relaySetKey, (_e, key: string) => {
    settings.setRelayKey(key);
    relay.apply();
    return relay.status();
  });
  ipcMain.handle(IPC.relayClearKey, () => {
    settings.clearRelayKey();
    relay.apply();
    return relay.status();
  });

  // OpenAPI generation (runs the commands configured in *.pc.yml)
  ipcMain.handle(IPC.openapiInfo, (_e, root: string) => generation.info(projectAt(root)));
  ipcMain.handle(IPC.openapiGenerate, (_e, root: string, id: string) => {
    const project = projectAt(root);
    const component = project.components.find((c) => c.id === id);
    if (!component) throw new Error(`Component ${id} not found`);
    return generation.generate(project, component);
  });
  ipcMain.handle(IPC.openapiGenerateAll, (_e, root: string) => generation.generateAll(projectAt(root)));
  ipcMain.handle(IPC.openapiCancel, (_e, id: string) => generation.cancel(id));

  // Editor: every change is written to the YAML database first, then the workspace is re-read
  const edit = (fn: () => void) => async (): Promise<EditResult> => {
    try {
      fn();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), info: workspace.info() };
    }
    await notifyWorkspaceChanged();
    return { ok: true, info: workspace.info() };
  };
  ipcMain.handle(IPC.editorUpdateProject, (_e, root: string, patch: ProjectPatch) =>
    edit(() => updateProject(workspace.requireRoot(root), patch))()
  );
  ipcMain.handle(IPC.editorSaveComponent, (_e, root: string, component: ComponentInput) =>
    edit(() => saveComponent(workspace.requireRoot(root), component))()
  );
  ipcMain.handle(IPC.editorDeleteComponent, (_e, root: string, id: string) =>
    edit(() => deleteComponent(workspace.requireRoot(root), id))()
  );
  ipcMain.handle(IPC.editorImportNew, (_e, root: string) => edit(() => importNewComponents(workspace.requireRoot(root)))());
  ipcMain.handle(IPC.editorMigrateCatalog, async (_e, root: string): Promise<EditResult> => {
    let message = '';
    const result = await edit(() => {
      const project = readProject(workspace.requireRoot(root));
      if (!project) throw new Error('No product-creator.yml in this folder');
      message = summarizeMigration(migrateProject(project));
    })();
    return { ...result, message };
  });
}

const COPYRIGHT_START_YEAR = 2022;
const SITE_URL = 'https://ecooz.net';
const REPO_URL = 'https://github.com/atai/product-creator';

function copyrightNotice(): string {
  return `Copyright © ${COPYRIGHT_START_YEAR}-${new Date().getFullYear()} Rustam Atai`;
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
        { label: 'Check for Updates…', click: () => void checkForUpdatesInteractive() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'ecooz.net', click: () => void shell.openExternal(SITE_URL) },
        { label: 'GitHub Repository', click: () => void shell.openExternal(REPO_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#f9fafb',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  mainWindow = win;
  attachMacMultiDisplayResizeGuard(win, screen);
  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  updateTitle();
}

/**
 * PC_SMOKE_TEST=1: load the workspace, call a few API routes through the same dispatcher as the UI,
 * render the window, save a screenshot (PC_SMOKE_SCREENSHOT) and exit. Used for local/CI verification.
 */
async function runSmokeTest() {
  const report: Record<string, unknown> = { projects: workspace.info().projects.map((p) => ({ root: p.root, origin: p.origin, notes: p.notes, components: p.project?.components.length, error: p.error })) };
  for (const url of ['/api/workspace', '/api/apps', '/api/features', '/api/business-objects', '/api/interfaces', '/api/validation']) {
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
  // PC_SMOKE_GENERATE=<component slug>: run its OpenAPI generate command, then list interfaces
  const genSlug = process.env.PC_SMOKE_GENERATE;
  if (genSlug) {
    const root = workspace.getRoots()[0];
    const project = projectAt(root);
    const component = project.components.find((c) => c.slug === genSlug);
    if (!component) {
      report.generate = { error: `no component with slug ${genSlug}` };
    } else {
      const result = await generation.generate(project, component);
      const res = await handleApi({ method: 'GET', url: `/api/interfaces?app=${component.id}` });
      const specs = (JSON.parse(res.body) as { specs: { file: string; operations: unknown[]; error?: string }[] }[])[0]?.specs ?? [];
      report.generate = {
        state: result.state,
        exitCode: result.exitCode,
        message: result.message,
        operations: result.operations,
        interfaces: specs.map((s) => ({ file: s.file, operations: s.operations.length, error: s.error })),
        logTail: result.log.slice(-300),
      };
    }
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
  const win = liveWindow();
  if (win) {
    if (win.webContents.isLoading()) await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()));
    // PC_SMOKE_EDIT=<new name>: rename the first component through the renderer bridge (editor IPC → YAML)
    if (process.env.PC_SMOKE_EDIT) {
      report.edit = await win.webContents.executeJavaScript(`(async () => {
        const info = await window.pc.workspace.get();
        const c = info.projects[0].project.components[0];
        const res = await window.pc.editor.saveComponent(info.projects[0].root, { ...c, name: ${JSON.stringify(process.env.PC_SMOKE_EDIT)} });
        const after = res.info.projects[0].project.components.find((x) => x.id === c.id);
        return { ok: res.ok, error: res.error, id: c.id, idKept: Boolean(after), name: after && after.name };
      })()`);
    }
    if (process.env.PC_SMOKE_ROUTE) {
      await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + process.env.PC_SMOKE_ROUTE)}`);
    }
    // PC_SMOKE_EVAL=<js>: run a script in the renderer (e.g. click buttons), then wait for the result
    if (process.env.PC_SMOKE_EVAL) {
      await new Promise((r) => setTimeout(r, 1500));
      report.eval = await win.webContents.executeJavaScript(process.env.PC_SMOKE_EVAL);
      await new Promise((r) => setTimeout(r, Number(process.env.PC_SMOKE_EVAL_WAIT ?? 4000)));
    }
    await new Promise((r) => setTimeout(r, 2500));
    report.rendererText = String(await win.webContents.executeJavaScript('document.body.innerText')).slice(0, 300);
    if (process.env.PC_SMOKE_TEXT_FILTER) {
      report.matches = String(await win.webContents.executeJavaScript('document.body.innerText'))
        .split('\n')
        .filter((l) => l.includes(process.env.PC_SMOKE_TEXT_FILTER as string))
        .slice(0, 20);
    }
    if (process.env.PC_SMOKE_SCREENSHOT) {
      const image = await win.webContents.capturePage();
      (await import('fs')).writeFileSync(process.env.PC_SMOKE_SCREENSHOT, image.toPNG());
    }
  }
  console.log('PC_SMOKE_RESULT ' + JSON.stringify(report, null, 2));
  // app.exit skips before-quit / will-quit
  await shutdown();
  app.exit(0);
}

// A second `product-creator <folder>` adds the folder to the running instance
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', async (_e, argv, workingDirectory) => {
    const folders = parseProjectArgs(argv, { ...process.env, INIT_CWD: workingDirectory }, workingDirectory, { packaged: app.isPackaged });
    if (folders.length && workspace.add(...folders)) await notifyWorkspaceChanged();
    const win = liveWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    } else if (app.isReady()) {
      createWindow();
    }
  });

  app.whenReady().then(async () => {
    const folders = parseProjectArgs(process.argv, process.env, process.cwd(), { packaged: app.isPackaged });
    if (folders.length) workspace.add(...folders);
    // dev: open the folder `pnpm desktop` ran in; packaged app starts with the saved workspace or empty
    else if (workspace.getRoots().length === 0 && !app.isPackaged) workspace.add(defaultProjectFolder());
    await workspace.reload();
    registerIpc();
    await mcp.apply();
    void loginShellPath().then((p) => {
      shellPath = p;
    });
    app.setAboutPanelOptions({
      copyright: copyrightNotice(),
      credits: `${REPO_URL}\n${SITE_URL}`,
      website: SITE_URL,
    });
    buildMenu();
    createWindow();
    if (process.env.PC_SMOKE_TEST) void runSmokeTest();
    else startAutoUpdates();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // Windows already closed; await stop so MCP server.close finishes before process exit.
  // Second app.quit() reaches will-quit with the flag set and does not preventDefault again.
  let shutdownStarted = false;
  app.on('will-quit', (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    shutdownStarted = true;
    void shutdown().finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
