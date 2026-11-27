import * as fs from 'fs';
import * as path from 'path';
import { FEATURES_DIR, LEGACY_FEATURES_DIR } from '../repository/configs';
import type { ProjectModel } from '../project/model';

/**
 * Explicit migration of the catalog layout (PRODUCTCREATOR-28): `<catalog>/functions/**` → `<catalog>/features/**`.
 * Until it runs, the old folder is read transparently. Files are moved, never overwritten:
 * a target that already exists with the same content removes the source, a different one is a conflict (left in place).
 */
export interface CatalogMigrationResult {
  /** Catalog folder (absolute) */
  catalog: string;
  /** Files moved, relative to the catalog */
  moved: string[];
  /** Already present in features/ with the same content; the old copy was removed */
  identical: string[];
  /** Present in features/ with a different content; both files kept */
  conflicts: string[];
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

/** Remove empty folders below (and including) dir */
function pruneEmpty(dir: string): void {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmpty(path.join(dir, entry.name));
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

/** Number of YAML cards still in the old folder of a catalog */
export function legacyFeatureFileCount(catalogDir: string): number {
  return listFiles(path.join(catalogDir, LEGACY_FEATURES_DIR)).filter((f) => /\.ya?ml$/.test(f)).length;
}

export function migrateFeatureFolders(catalogDir: string, options: { dryRun?: boolean } = {}): CatalogMigrationResult {
  const result: CatalogMigrationResult = { catalog: catalogDir, moved: [], identical: [], conflicts: [] };
  const legacy = path.join(catalogDir, LEGACY_FEATURES_DIR);
  const target = path.join(catalogDir, FEATURES_DIR);
  for (const file of listFiles(legacy)) {
    const rel = path.relative(legacy, file);
    const dest = path.join(target, rel);
    const shown = path.join(FEATURES_DIR, rel);
    if (fs.existsSync(dest)) {
      if (fs.readFileSync(dest).equals(fs.readFileSync(file))) {
        result.identical.push(shown);
        if (!options.dryRun) fs.unlinkSync(file);
      } else {
        result.conflicts.push(path.join(LEGACY_FEATURES_DIR, rel));
      }
      continue;
    }
    result.moved.push(shown);
    if (!options.dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(file, dest);
    }
  }
  if (!options.dryRun) pruneEmpty(legacy);
  return result;
}

/** Catalog folders (absolute) of a project's components */
export function projectCatalogs(project: ProjectModel): string[] {
  return [...new Set(project.components.map((c) => path.resolve(project.root, c.catalog)))];
}

/** Catalogs of the project that still have the old functions/ folder, with the number of cards in it */
export function legacyCatalogs(project: ProjectModel): { catalog: string; files: number }[] {
  return projectCatalogs(project)
    .map((catalog) => ({ catalog, files: legacyFeatureFileCount(catalog) }))
    .filter((c) => c.files > 0);
}

export function migrateProject(project: ProjectModel, options: { dryRun?: boolean } = {}): CatalogMigrationResult[] {
  return projectCatalogs(project)
    .filter((catalog) => fs.existsSync(path.join(catalog, LEGACY_FEATURES_DIR)))
    .map((catalog) => migrateFeatureFolders(catalog, options));
}

/** One line for the UI / CLI: "moved 12, identical 0, conflicts 0" (+ the conflicting files) */
export function summarizeMigration(results: CatalogMigrationResult[], options: { dryRun?: boolean } = {}): string {
  const sum = (k: 'moved' | 'identical' | 'conflicts') => results.reduce((n, r) => n + r[k].length, 0);
  const conflicts = results.flatMap((r) => r.conflicts.map((f) => path.join(r.catalog, f)));
  const line = options.dryRun
    ? `functions/ → features/ (dry run): would move ${sum('moved')}, identical ${sum('identical')}, conflicts ${sum('conflicts')}`
    : `functions/ → features/: moved ${sum('moved')}, identical ${sum('identical')} (old copy removed), conflicts ${sum('conflicts')}`;
  return conflicts.length ? `${line}\nKept (features/ has a different version): ${conflicts.join(', ')}` : line;
}
