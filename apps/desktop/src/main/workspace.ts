import * as fs from 'fs';
import * as path from 'path';
import { configureStorage, resetStorage } from '@pc/core/storage';
import { openProject, toStorageEntities, PROJECT_FILE, type OpenResult } from '@pc/core/project/model';
import type { WorkspaceInfo, WorkspaceProjectInfo } from '../shared/ipc';

/**
 * Multi-project workspace: the list of opened project folders, persisted in the user data dir.
 * Each project is read from its YAML database (product-creator.yml + *.pc.yml); the first open of
 * a folder imports the model from the layout once. All components of all projects are exposed to
 * the UI as "apps" (header selector), keyed by component UUID.
 */
export class Workspace {
  private roots: string[] = [];
  private loaded = new Map<string, OpenResult>();
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

  /** Project root that is open in the workspace (guards editor calls) */
  requireRoot(root: string): string {
    const resolved = path.resolve(root);
    if (!this.roots.includes(resolved)) throw new Error(`${resolved} is not open in the workspace`);
    return resolved;
  }

  /** (Re)read the YAML databases of all projects and reconfigure the core storage */
  async reload(): Promise<void> {
    const previous = this.loaded;
    this.loaded = new Map();
    this.errors.clear();
    for (const root of this.roots) {
      try {
        const result = openProject(root);
        // keep import/migration notes of this session visible after edits
        const before = previous.get(root);
        if (result.origin === 'read' && before && before.origin !== 'read') {
          result.origin = before.origin;
          result.notes = before.notes;
        }
        this.loaded.set(root, result);
      } catch (error) {
        this.errors.set(root, error instanceof Error ? error.message : String(error));
      }
    }
    await resetStorage();
    configureStorage({
      manifest: { ...toStorageEntities([...this.loaded.values()].map((r) => r.project)), source: PROJECT_FILE },
    });
  }

  info(): WorkspaceInfo {
    return {
      projects: this.roots.map((root): WorkspaceProjectInfo => {
        const r = this.loaded.get(root);
        if (!r) return { root, error: this.errors.get(root) ?? 'Not loaded' };
        return { root, project: r.project, origin: r.origin, notes: r.notes };
      }),
    };
  }
}
