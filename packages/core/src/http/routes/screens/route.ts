import { getStorage, type FunctionStorage } from '../../../storage';
import logger from '../../../logger';
import { DEFAULT_SCREENSHOT_TIMEOUT_SEC, readProject, type ProjectModel } from '../../../project/model';
import { captureScreens, screensRequest, type CaptureReport } from '../../../screens/index';

/**
 * Screenshot capture of a project (PRODUCTCREATOR-36). A run takes minutes (services, seeding, a browser), so
 * POST starts it in the background and GET polls it; DELETE cancels.
 *   POST   /api/screens { project }         start (409 if one is running)
 *   GET    /api/screens?project=<id>        { configured, screens, running, log, report? }
 *   DELETE /api/screens?project=<id>        cancel the running capture
 */
interface Run {
  controller: AbortController;
  running: boolean;
  /** Resolves when the run has ended, teardown included */
  done: Promise<void>;
  /** Longest time stopping the run can take after a cancel: services, then every teardown command */
  stopBudgetMs: number;
  log: string;
  report?: CaptureReport;
}
const runs = new Map<string, Run>();
const MAX_LOG = 100_000;

function projectOf(storage: FunctionStorage, id: string | null | undefined): ProjectModel | Response {
  const ids = id ? [id] : storage.getAllProjects().map((p) => p.id);
  if (ids.length !== 1) return Response.json({ error: 'project is required (several projects are open)' }, { status: 400 });
  const root = storage.getProjectRoot(ids[0]);
  const project = root ? readProject(root) : null;
  return project ?? Response.json({ error: `project "${ids[0]}" not found` }, { status: 404 });
}

export async function GET(request: Request) {
  const storage = await getStorage();
  const project = projectOf(storage, new URL(request.url).searchParams.get('project'));
  if (project instanceof Response) return project;
  const run = runs.get(project.id);
  return Response.json({
    configured: Boolean(project.screenshots),
    screens: screensRequest(project, storage.modelSnapshot()).screens.length,
    running: run?.running ?? false,
    log: run?.log ?? '',
    report: run?.report,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { project?: string };
    const storage = await getStorage();
    const project = projectOf(storage, body.project);
    if (project instanceof Response) return project;
    if (runs.get(project.id)?.running) return Response.json({ error: 'A capture is already running' }, { status: 409 });
    if (!project.screenshots) return Response.json({ error: 'No screenshots configured in product-creator.yml (screenshots.capture)' }, { status: 400 });
    const settings = project.screenshots;
    const stopBudgetMs = SERVICE_STOP_MS * (settings.start?.length ?? 0) + (settings.teardown ?? []).reduce((ms, c) => ms + (c.timeoutSec ?? DEFAULT_SCREENSHOT_TIMEOUT_SEC) * 1000, 0) + 5000;
    const run: Run = { controller: new AbortController(), running: true, log: '', done: Promise.resolve(), stopBudgetMs };
    runs.set(project.id, run);
    run.done = captureScreens(project, storage.modelSnapshot(), {
      signal: run.controller.signal,
      onLog: (chunk) => {
        run.log = (run.log + chunk).slice(-MAX_LOG);
      },
    })
      .then((report) => {
        run.report = { ...report, log: '' };
      })
      .catch((error) => {
        logger.error('Screenshot capture failed', { error });
        run.report = { state: 'failed', message: error instanceof Error ? error.message : String(error), requested: 0, captured: 0, failed: [], log: '' };
      })
      .finally(() => {
        run.running = false;
      });
    return Response.json({ started: true }, { status: 202 });
  } catch (error) {
    logger.error('Failed to start the screenshot capture', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const storage = await getStorage();
  const project = projectOf(storage, new URL(request.url).searchParams.get('project'));
  if (project instanceof Response) return project;
  const run = runs.get(project.id);
  if (!run?.running) return Response.json({ cancelled: false });
  run.controller.abort();
  return Response.json({ cancelled: true });
}

/** Background services are given this long to exit when a run stops (startBackground) */
const SERVICE_STOP_MS = 5000;

/** Time the running captures may need to stop: 0 when none runs (app quit decides how long to wait) */
export function captureStopBudgetMs(): number {
  return Math.max(0, ...[...runs.values()].filter((r) => r.running).map((r) => r.stopBudgetMs));
}

/** Cancel every running capture and wait until their services are stopped and teardown commands have run (app quit) */
export async function cancelAllCaptures(): Promise<void> {
  const running = [...runs.values()].filter((r) => r.running);
  for (const run of running) run.controller.abort();
  await Promise.all(running.map((r) => r.done));
}
