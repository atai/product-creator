import * as path from 'path';

/** Folder name of the production build inside the OS application-data directory (= productName) */
export const PROD_DATA_DIR_NAME = 'Product Creator';
/** Folder name used by every non-packaged (development) run */
export const DEV_DATA_DIR_NAME = 'Product Creator Dev';

export interface UserDataInput {
  isPackaged: boolean;
  /** `app.getPath('appData')` — ~/Library/Application Support, %APPDATA%, ~/.config */
  appData: string;
  env?: NodeJS.ProcessEnv;
  /** Electron's own `--user-data-dir=<dir>` switch was passed (it is respected) */
  hasUserDataSwitch?: boolean;
}

/**
 * Where the app keeps its settings and data (workspace.json, logs, update cache, ...).
 * Returns the folder to pass to `app.setPath('userData', …)`, or `undefined` to keep Electron's default.
 *
 * - `PC_USER_DATA_DIR` always wins (tests, portable setups);
 * - the production build keeps the default `<appData>/Product Creator`;
 * - a development run (not packaged) uses `<appData>/Product Creator Dev`, so it never reads or writes
 *   the data of an installed build — unless `--user-data-dir` was given explicitly.
 */
export function resolveUserDataDir({ isPackaged, appData, env = process.env, hasUserDataSwitch = false }: UserDataInput): string | undefined {
  const override = env.PC_USER_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  if (isPackaged || hasUserDataSwitch) return undefined;
  return path.join(appData, DEV_DATA_DIR_NAME);
}
