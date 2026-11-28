import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_SPEC_OUTPUT, PROJECT_FILE, type ProjectModel } from '../project/model';
import type { CatalogModel } from '../validation/model';
import { renderAgent } from './agent';
import { buildSpec, type SpecModel } from './build';
import { renderHuman } from './human';
import { messagesFor } from './messages';

/**
 * Spec generation (PRODUCTCREATOR-35): the catalog of a project → `spec.md` (people) + `agent/` (manifest and
 * chunks for agents), written to `spec.output` of product-creator.yml (default docs/spec). Used by the CLI
 * (`product-creator spec`), the API (/api/spec), the Doc page and MCP (get_spec).
 */
export const HUMAN_FILE = 'spec.md';
export const AGENT_DIR = 'agent';

export interface GeneratedSpec {
  spec: SpecModel;
  /** Files relative to the output folder */
  files: Record<string, string>;
  /** Language of the labels (differs from spec.language when no label catalog exists for it) */
  labelsLanguage: string;
  labelsFallback: boolean;
}

export function generateSpec(project: ProjectModel, model: CatalogModel): GeneratedSpec {
  const spec = buildSpec(project, model);
  const { messages, language, fallback } = messagesFor(spec.language);
  const files: Record<string, string> = { [HUMAN_FILE]: renderHuman(spec, messages) };
  for (const [file, content] of Object.entries(renderAgent(spec, { labelsLanguage: language, labelsFallback: fallback }))) files[`${AGENT_DIR}/${file}`] = content;
  return { spec, files, labelsLanguage: language, labelsFallback: fallback };
}

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

/** Writes the files; spec.md and agent/ are replaced as a whole (no stale chunks), other files of the folder are kept */
export function writeSpec(project: ProjectModel, generated: GeneratedSpec): { dir: string; files: string[] } {
  const dir = specOutputDir(project);
  fs.rmSync(path.join(dir, AGENT_DIR), { recursive: true, force: true });
  fs.rmSync(path.join(dir, HUMAN_FILE), { force: true });
  const written = Object.keys(generated.files).sort();
  for (const rel of written) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generated.files[rel]);
  }
  return { dir, files: written };
}
