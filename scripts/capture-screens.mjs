#!/usr/bin/env node
// Screenshot capturer of Product Creator itself (PRODUCTCREATOR-36, dogfood).
// Configured as screenshots.capture in product-creator.yml; Product Creator runs it with PC_SCREENS_REQUEST.
// Launches the built desktop app once in smoke mode with this repo open and a throw-away data folder; the app
// (apps/desktop/src/main/screens.ts) captures every requested screen and writes screens.json.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const request = process.env.PC_SCREENS_REQUEST;
if (!request) {
  console.error('PC_SCREENS_REQUEST is not set: run through `product-creator spec` or the Doc page');
  process.exit(2);
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(repo, 'apps/desktop');
if (!existsSync(join(appDir, 'out/main/index.js'))) {
  console.error('The desktop app is not built: pnpm desktop:build');
  process.exit(2);
}
const electron = createRequire(join(appDir, 'package.json'))('electron');
const userData = mkdtempSync(join(tmpdir(), 'pc-screens-'));

const child = spawn(electron, [appDir, '--project', repo], {
  stdio: ['ignore', 'pipe', 'inherit'],
  // the app interface in the language of this capture run (screenshots.perLanguage, PRODUCTCREATOR-37)
  env: { ...process.env, PC_SMOKE_TEST: '1', PC_SMOKE_SCREENS: request, PC_USER_DATA_DIR: userData, ...(process.env.PC_SCREENS_LANGUAGE ? { PC_UI_LANGUAGE: process.env.PC_SCREENS_LANGUAGE } : {}) },
});
let out = '';
child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk));
child.on('close', (code) => {
  rmSync(userData, { recursive: true, force: true });
  const match = out.match(/"screens":\s*(\{[^}]*\})/);
  console.log(match ? `captured ${match[1]}` : out.slice(-2000));
  process.exit(code ?? 1);
});
