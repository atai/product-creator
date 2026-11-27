import * as path from 'path';
import { readProject } from '@pc/core/project/model';
import { migrateProject, summarizeMigration } from '@pc/core/catalog/migrate';

/**
 * Command-line mode without Electron (bin/product-creator.mjs runs it with node):
 *   product-creator migrate [folder...] [--dry-run]   move functions/ → features/ in all catalogs (PRODUCTCREATOR-28)
 * Exit code: 0 ok, 1 problems found (e.g. conflicts), 2 usage error.
 */
export const CLI_COMMANDS = ['migrate'] as const;
export type CliCommand = (typeof CLI_COMMANDS)[number];

export interface CliIo {
  log(line: string): void;
  error(line: string): void;
  cwd: string;
}

function projectsOf(folders: string[], io: CliIo) {
  const roots = (folders.length ? folders : [io.cwd]).map((f) => path.resolve(io.cwd, f));
  return roots.map((root) => ({ root, project: readProject(root) }));
}

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('-')));
  const folders = rest.filter((a) => !a.startsWith('-'));
  if (command === 'migrate') {
    let exit = 0;
    for (const { root, project } of projectsOf(folders, io)) {
      if (!project) {
        io.error(`${root}: no product-creator.yml (open the folder in the app once to create it)`);
        exit = 2;
        continue;
      }
      const dryRun = flags.has('--dry-run');
      const results = migrateProject(project, { dryRun });
      io.log(`${project.name} (${root})`);
      io.log(`  ${summarizeMigration(results, { dryRun }).replace(/\n/g, '\n  ')}`);
      if (results.some((r) => r.conflicts.length)) exit = Math.max(exit, 1);
    }
    return exit;
  }
  io.error(`Usage: product-creator [folder...] | ${CLI_COMMANDS.map((c) => `product-creator ${c} [folder...]`).join(' | ')}`);
  return 2;
}

// Entry point when run as out/main/cli.js
if (process.argv[1] && /cli\.(c?js|ts)$/.test(process.argv[1])) {
  void runCli(process.argv.slice(2), { log: (l) => console.log(l), error: (l) => console.error(l), cwd: process.env.INIT_CWD || process.cwd() }).then(
    (code) => process.exit(code)
  );
}
