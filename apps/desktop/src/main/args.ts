import * as path from 'path';

/**
 * Project folders to open, from the command line:
 *   product-creator [folder...]            (bin/product-creator.mjs passes the cwd)
 *   electron . --project <folder> [--project <folder>]
 * Fallback: PC_PROJECT env, then INIT_CWD (directory where `pnpm ...` was invoked), then cwd.
 */
export function parseProjectArgs(argv: string[], env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string[] {
  const result: string[] = [];
  // argv[0] is electron; in dev argv[1] is the app path ('.'), skip electron/chromium flags
  const args = argv.slice(1);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project' && args[i + 1]) {
      result.push(args[++i]);
    } else if (arg.startsWith('--project=')) {
      result.push(arg.slice('--project='.length));
    }
  }
  if (result.length === 0 && env.PC_PROJECT) result.push(...env.PC_PROJECT.split(path.delimiter));
  return result.map((p) => path.resolve(env.INIT_CWD || cwd, p));
}

/** Folder used when nothing was passed and the workspace is empty */
export function defaultProjectFolder(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  return path.resolve(env.INIT_CWD || cwd);
}
