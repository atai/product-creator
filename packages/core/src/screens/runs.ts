import type { CaptureReport } from './index';

/**
 * Running screenshot captures, per project (PRODUCTCREATOR-36). Kept apart from the HTTP route so that the app's
 * main process can import it statically: quitting must not load code lazily (a rebuilt `out/` would not have it).
 */
export interface CaptureRun {
  controller: AbortController;
  running: boolean;
  /** Resolves when the run has ended, teardown included */
  done: Promise<void>;
  /** Longest time stopping the run can take after a cancel: services, then every teardown command */
  stopBudgetMs: number;
  log: string;
  report?: CaptureReport;
}

export const captureRuns = new Map<string, CaptureRun>();

/** Time the running captures may need to stop: 0 when none runs (app quit decides how long to wait) */
export function captureStopBudgetMs(): number {
  return Math.max(0, ...[...captureRuns.values()].filter((r) => r.running).map((r) => r.stopBudgetMs));
}

/** Cancel every running capture and wait until their services are stopped and teardown commands have run (app quit) */
export async function cancelAllCaptures(): Promise<void> {
  const running = [...captureRuns.values()].filter((r) => r.running);
  for (const run of running) run.controller.abort();
  await Promise.all(running.map((r) => r.done));
}
