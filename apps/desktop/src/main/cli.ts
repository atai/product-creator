import * as fs from 'fs';
import * as path from 'path';
import { readProject, toStorageEntities, PROJECT_FILE } from '@pc/core/project/model';
import { migrateProject, summarizeMigration } from '@pc/core/catalog/migrate';
import { generateSpec, writeSpec } from '@pc/core/spec/index';
import { captureScreens } from '@pc/core/screens/index';
import { configureStorage, getStorage, resetStorage } from '@pc/core/storage';
import { countIssues, validateModel, type ValidationIssue } from '@pc/core/validation/model';
import type { AppEntity } from '@pc/core/types';
import logger from '@pc/core/logger';

/**
 * Command-line mode without Electron (bin/product-creator.mjs runs it with node):
 *   product-creator migrate [folder...] [--dry-run]   move functions/ → features/ in all catalogs (PRODUCTCREATOR-28)
 *   product-creator lint [folder...] [--warnings] [--info] [--json]   model validation of the catalogs (PRODUCTCREATOR-29);
 *                                                     design checks (PRODUCTCREATOR-34) are advisory by default: warnings and info
 *   product-creator lint --catalog <dir> [...]        validate one catalog folder of a repo without product-creator.yml (read only)
 *   product-creator spec [folder...] [--strict] [--no-screens] [--language <tag>]   write <lang>/spec.md per project
 *                                                     language + agent/ to spec.output (PRODUCTCREATOR-35, -37);
 *                                                     screenshots are captured first when configured (PRODUCTCREATOR-36);
 *                                                     --no-screens reuses the images there are;
 *                                                     --strict: exit 1 when the model has errors (the spec is written anyway)
 * Exit code: 0 ok, 1 problems found (conflicts, model errors), 2 usage error.
 */
export const CLI_COMMANDS = ['migrate', 'lint', 'spec'] as const;
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
  if (command === 'lint') return lint(rest, io);
  if (command === 'spec') {
    // --language <tag>: one language instead of all project languages (PRODUCTCREATOR-37)
    const at = rest.indexOf('--language');
    const language = at >= 0 ? rest[at + 1] : undefined;
    return spec(folders.filter((f) => f !== language), flags, io, language);
  }
  io.error(`Usage: product-creator [folder...] | ${CLI_COMMANDS.map((c) => `product-creator ${c} [folder...]`).join(' | ')}`);
  return 2;
}

async function lint(args: string[], io: CliIo): Promise<number> {
  const flags = new Set(args.filter((a) => a.startsWith('--') && a !== '--catalog'));
  const catalogs: string[] = [];
  const folders: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--catalog' && args[i + 1]) catalogs.push(path.resolve(io.cwd, args[++i]));
    else if (!args[i].startsWith('--')) folders.push(args[i]);
  }
  const projects = [];
  const apps: AppEntity[] = [];
  for (const dir of catalogs) {
    if (!fs.existsSync(dir)) {
      io.error(`${dir}: no such folder`);
      return 2;
    }
    apps.push({ id: `catalog:${dir}`, name: path.basename(dir), projectId: 'catalogs', directory: dir });
  }
  if (!catalogs.length || folders.length) {
    for (const { root, project } of projectsOf(folders, io)) {
      if (!project) {
        io.error(`${root}: no product-creator.yml (open the folder in the app once, or use --catalog <dir>)`);
        return 2;
      }
      projects.push(project);
    }
  }
  const entities = toStorageEntities(projects);
  // the CLI prints a report; the storage debug log would drown it
  for (const t of logger.transports) t.silent = true;
  await resetStorage();
  configureStorage({ manifest: { projects: [...entities.projects, ...(apps.length ? [{ id: 'catalogs', name: 'catalogs' }] : [])], apps: [...entities.apps, ...apps], source: PROJECT_FILE }, watch: false });
  const storage = await getStorage();
  const shown = (s: string) => s === 'error' || (s === 'warning' && (flags.has('--warnings') || flags.has('--info'))) || (s === 'info' && flags.has('--info'));
  const issues = validateModel(storage.modelSnapshot()).filter((i) => shown(i.severity));
  const all = validateModel(storage.modelSnapshot());
  await resetStorage();
  const counts = countIssues(all);
  const names = new Map([...entities.apps, ...apps].map((a) => [a.id, a.name]));
  if (flags.has('--json')) {
    io.log(JSON.stringify({ ...counts, issues }, null, 2));
  } else {
    const byFile = new Map<string, ValidationIssue[]>();
    for (const i of issues) byFile.set(i.file ?? `(${i.kind} ${i.id})`, [...(byFile.get(i.file ?? `(${i.kind} ${i.id})`) ?? []), i]);
    for (const [file, list] of byFile) {
      io.log(path.isAbsolute(file) ? path.relative(io.cwd, file) || file : file);
      for (const i of list) io.log(`  ${i.severity === 'error' ? 'error' : i.severity === 'warning' ? 'warn ' : 'info '}  ${i.code.padEnd(28)} ${i.field ? `${i.field}: ` : ''}${i.message}`);
    }
    const scope = [...new Set([...entities.apps, ...apps].map((a) => names.get(a.id)))].join(', ');
    const hidden = flags.has('--info') ? '' : flags.has('--warnings') ? ' (info hidden; --info shows it)' : ' (warnings and info hidden; --warnings / --info show them)';
    io.log(`${counts.errors} error(s), ${counts.warnings} warning(s), ${counts.infos} info in ${scope || 'no catalogs'}${hidden}`);
  }
  return counts.errors > 0 ? 1 : 0;
}

async function spec(folders: string[], flags: Set<string>, io: CliIo, language?: string): Promise<number> {
  const projects = [];
  for (const { root, project } of projectsOf(folders, io)) {
    if (!project) {
      io.error(`${root}: no product-creator.yml (open the folder in the app once to create it)`);
      return 2;
    }
    projects.push(project);
  }
  for (const t of logger.transports) t.silent = true;
  await resetStorage();
  configureStorage({ manifest: { ...toStorageEntities(projects), source: PROJECT_FILE }, watch: false });
  const model = (await getStorage()).modelSnapshot();
  await resetStorage();
  let exit = 0;
  for (const project of projects) {
    try {
      if (project.screenshots && !flags.has('--no-screens')) {
        io.log(`${project.name}: capturing screenshots`);
        // command output, line by line through io
        let pending = '';
        const onLog = (chunk: string) => {
          const lines = (pending + chunk).split('\n');
          pending = lines.pop() ?? '';
          lines.forEach((l) => io.log(`  | ${l}`));
        };
        const report = await captureScreens(project, model, { onLog });
        if (pending) io.log(`  | ${pending}`);
        io.log(`  screenshots: ${report.state}${report.message ? ` (${report.message})` : ''}, ${report.captured}/${report.requested} with an image`);
        for (const f of report.failed) io.log(`  failed ${f.feature} ${f.id}: ${f.error ?? 'capture failed'}`);
        if (report.state === 'failed' || report.state === 'cancelled') exit = Math.max(exit, 1);
      }
      const generated = generateSpec(project, model, language ? { languages: [language] } : {});
      const { dir, files } = writeSpec(project, generated);
      const { errors, warnings } = generated.spec.counts;
      io.log(`${project.name}: ${files.length} file(s) in ${path.relative(io.cwd, dir) || dir}`);
      io.log(`  ${generated.spec.features.length} feature(s), ${generated.spec.objects.length} object(s), ${generated.spec.workflows.length} workflow(s)`);
      for (const l of generated.languages) {
        io.log(`  ${l.file}${l.untranslated ? `: ${l.untranslated} text(s) not translated` : ''}${l.labelsFallback ? ` (no labels for "${l.language}", headings in ${l.labelsLanguage})` : ''}`);
      }
      io.log(`  ${errors} error(s), ${warnings} warning(s)${errors ? ': the spec says it is not ready' : ''}`);
      if (errors && flags.has('--strict')) exit = 1;
    } catch (error) {
      io.error(`${project.name}: ${error instanceof Error ? error.message : String(error)}`);
      exit = 2;
    }
  }
  return exit;
}

// Entry point when run as out/main/cli.js
if (process.argv[1] && /cli\.(c?js|ts)$/.test(process.argv[1])) {
  void runCli(process.argv.slice(2), { log: (l) => console.log(l), error: (l) => console.error(l), cwd: process.env.INIT_CWD || process.cwd() }).then(
    (code) => process.exit(code)
  );
}
