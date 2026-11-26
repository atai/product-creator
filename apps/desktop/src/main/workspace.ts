import * as fs from 'fs';
import * as path from 'path';
import { configureStorage, resetStorage } from '@pc/core/storage';
import { loadProject, toManifestYaml, toStorageEntities, MANIFEST_FILE, type ProjectManifest } from '@pc/core/project/manifest';
import type { WorkspaceInfo, WorkspaceProjectInfo } from '../shared/ipc';

/**
 * Multi-project workspace: the list of opened project folders, persisted in the user data dir.
 * All services of all opened projects are exposed to the UI as "apps" (header selector).
 */
export class Workspace {
  private roots: string[] = [];
  private loaded = new Map<string, ProjectManifest>();
  private errors = new Map<string, string>();

  constructor(private stateFile: string) {
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as { projects?: string[] };
      this.roots = (data.projects ?? []).filter((p) => fs.existsSync(p));
    } catch {
      this.roots = [];
    }
  }

  private persist() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify({ projects: this.roots }, null, 2));
  }

  getRoots(): string[] {
    return [...this.roots];
  }

  /** Add folders (keeps order, no duplicates). Returns true when something changed. */
  add(...folders: string[]): boolean {
    let changed = false;
    for (const folder of folders.map((f) => path.resolve(f))) {
      if (!this.roots.includes(folder)) {
        this.roots.push(folder);
        changed = true;
      }
    }
    if (changed) this.persist();
    return changed;
  }

  remove(folder: string): boolean {
    const before = this.roots.length;
    this.roots = this.roots.filter((r) => r !== path.resolve(folder));
    if (this.roots.length !== before) this.persist();
    return this.roots.length !== before;
  }

  /** (Re)load manifests of all projects and reconfigure the core storage */
  async reload(): Promise<void> {
    this.loaded.clear();
    this.errors.clear();
    for (const root of this.roots) {
      try {
        this.loaded.set(root, loadProject(root));
      } catch (error) {
        this.errors.set(root, error instanceof Error ? error.message : String(error));
      }
    }
    await resetStorage();
    configureStorage({ manifest: { ...toStorageEntities([...this.loaded.values()]), source: MANIFEST_FILE } });
  }

  writeManifest(root: string): void {
    const project = this.loaded.get(path.resolve(root)) ?? loadProject(root);
    const file = path.join(project.root, MANIFEST_FILE);
    if (fs.existsSync(file)) throw new Error(`${file} already exists`);
    fs.writeFileSync(file, toManifestYaml(project));
  }

  info(): WorkspaceInfo {
    return {
      projects: this.roots.map((root): WorkspaceProjectInfo => {
        const p = this.loaded.get(root);
        if (!p) return { root, error: this.errors.get(root) ?? 'Not loaded' };
        return {
          root,
          id: p.id,
          name: p.name,
          source: p.source,
          services: p.services.map((s) => ({
            id: s.id,
            name: s.name,
            path: s.path,
            catalog: s.catalog,
            openapi: s.openapi,
            dbSchemaPath: s.dbSchemaPath,
          })),
        };
      }),
    };
  }
}
