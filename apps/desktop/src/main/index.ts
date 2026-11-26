import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import * as path from 'path';
import { deleteComponent, importNewComponents, readProject, saveComponent, updateProject, type ProjectModel } from '@pc/core/project/model';
import { loginShellPath, OpenApiGenerationManager } from '@pc/core/interfaces/generator';
import { IPC, type ApiRequest, type ApiResponse, type ComponentInput, type EditResult, type ProjectPatch } from '../shared/ipc';
import { parseProjectArgs, defaultProjectFolder } from './args';
import { Workspace } from './workspace';

// File logs of @pc/core go to the user data dir, never into the opened project
process.env.PC_LOG_DIR ??= path.join(app.getPath('userData'), 'logs');

let mainWindow: BrowserWindow | null = null;
const workspace = new Workspace(path.join(app.getPath('userData'), 'workspace.json'));

// GUI-launched apps (Dock/Finder) miss the shell PATH (pnpm, node): resolve it once from the login shell
let shellPath: string | undefined;
const generation = new OpenApiGenerationManager({ env: () => (shellPath ? { PATH: shellPath } : undefined) });
generation.onEvent((event) => mainWindow?.webContents.send(IPC.openapiEvent, event));

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
  mainWindow?.webContents.send(IPC.workspaceChanged, workspace.info());
  updateTitle();
}

function updateTitle() {
  const names = workspace.info().projects.map((p) => p.project?.name ?? path.basename(p.root));
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
  const report: Record<string, unknown> = { projects: workspace.info().projects.map((p) => ({ root: p.root, origin: p.origin, notes: p.notes, components: p.project?.components.length, error: p.error })) };
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
  const win = mainWindow;
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
  app.exit(0);
}

// A second `product-creator <folder>` adds the folder to the running instance
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', async (_e, argv, workingDirectory) => {
    const folders = parseProjectArgs(argv, { ...process.env, INIT_CWD: workingDirectory }, workingDirectory, { packaged: app.isPackaged });
    if (folders.length && workspace.add(...folders)) await notifyWorkspaceChanged();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const folders = parseProjectArgs(process.argv, process.env, process.cwd(), { packaged: app.isPackaged });
    if (folders.length) workspace.add(...folders);
    // dev: open the folder `pnpm desktop` ran in; packaged app starts with the saved workspace or empty
    else if (workspace.getRoots().length === 0 && !app.isPackaged) workspace.add(defaultProjectFolder());
    await workspace.reload();
    registerIpc();
    void loginShellPath().then((p) => {
      shellPath = p;
    });
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
