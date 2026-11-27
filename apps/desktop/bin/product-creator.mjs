#!/usr/bin/env node
// Launch Product Creator for the current directory (or the folders given as arguments):
//   cd ~/git/my-repo && product-creator
//   product-creator ~/git/repo-a ~/git/repo-b
// Command-line mode (no window; exit code reports the result):
//   product-creator migrate [folder...] [--dry-run]
//   product-creator lint [folder...] [--warnings] [--json] [--catalog <dir>]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_COMMANDS = new Set(['migrate', 'lint']);

if (CLI_COMMANDS.has(process.argv[2])) {
  const cli = resolve(appDir, 'out/main/cli.js');
  if (!existsSync(cli)) {
    console.error('Product Creator is not built yet. Run: pnpm --filter desktop build');
    process.exit(1);
  }
  const run = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, INIT_CWD: process.cwd() } });
  run.on('exit', (code) => process.exit(code ?? 1));
} else {
  launch();
}

function launch() {
  const electron = require('electron');
  const folders = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const projects = (folders.length ? folders : [process.cwd()]).flatMap((f) => ['--project', resolve(f)]);

  if (!existsSync(resolve(appDir, 'out/main/index.js'))) {
    console.error('Product Creator is not built yet. Run: pnpm --filter desktop build');
    process.exit(1);
  }

  const child = spawn(electron, [appDir, ...projects], { stdio: 'inherit', detached: process.platform !== 'win32' });
  child.unref();
}
