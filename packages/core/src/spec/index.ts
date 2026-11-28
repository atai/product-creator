import * as fs from 'fs';
import * as path from 'path';
import type { ProjectModel } from '../project/model';
import { specOutputDir } from './output';
import type { CatalogModel } from '../validation/model';
import { renderAgent } from './agent';
import { buildSpec, type SpecModel } from './build';
import { renderHuman } from './human';
import { messagesFor } from './messages';

export { specOutputDir };

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
