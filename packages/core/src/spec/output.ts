import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_SPEC_OUTPUT, PROJECT_FILE, type ProjectModel } from '../project/model';

/** Absolute output folder; refuses folders that would mix the spec with the project files or the catalog */
export function specOutputDir(project: ProjectModel): string {
  const rel = project.spec?.output ?? DEFAULT_SPEC_OUTPUT;
  const root = path.resolve(project.root);
  const out = path.resolve(root, rel);
  const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);
  if (!inside(out, root) || out === root) throw new Error(`spec.output "${rel}" must be a folder inside the project`);
  const catalog = path.resolve(root, project.catalogRoot);
  if (inside(out, catalog) || inside(catalog, out)) throw new Error(`spec.output "${rel}" must not contain or be inside the catalog (${project.catalogRoot})`);
  if (fs.existsSync(path.join(out, PROJECT_FILE))) throw new Error(`spec.output "${rel}" holds a ${PROJECT_FILE}: choose another folder`);
  return out;
}
