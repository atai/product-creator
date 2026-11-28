import * as fs from 'fs';
import * as path from 'path';
import { projectLanguages, type ProjectModel } from '../project/model';
import { specOutputDir } from './output';
import type { CatalogModel } from '../validation/model';
import { renderAgent } from './agent';
import { buildSpec, type SpecModel } from './build';
import { renderHuman } from './human';
import { messagesFor } from './messages';

export { specOutputDir };

/**
 * Spec generation (PRODUCTCREATOR-35, -37): the catalog of a project → `<lang>/spec.md` per project language
 * (people) + `agent/` (manifest and chunks for agents, primary language), written to `spec.output` of product-creator.yml (default docs/spec). Used by the CLI
 * (`product-creator spec`), the API (/api/spec), the Doc page and MCP (get_spec).
 */
export const HUMAN_FILE = 'spec.md';
export const AGENT_DIR = 'agent';
/** The human spec of a language: <spec.output>/<lang>/spec.md (PRODUCTCREATOR-37) */
export const humanFile = (language: string) => `${language}/${HUMAN_FILE}`;

export interface SpecLanguage {
  language: string;
  /** Path of its spec.md relative to the output folder */
  file: string;
  /** Language of the labels (differs from `language` when there is no label catalog for it) */
  labelsLanguage: string;
  labelsFallback: boolean;
  untranslated: number;
  counts: SpecModel['counts'];
}

export interface GeneratedSpec {
  /** The spec in the primary language (the agent bundle is built from it) */
  spec: SpecModel;
  /** Files relative to the output folder */
  files: Record<string, string>;
  languages: SpecLanguage[];
  /** Labels of the primary language */
  labelsLanguage: string;
  labelsFallback: boolean;
}

/** Human specs in the given languages (default: all project languages) and the agent bundle in the primary one */
export function generateSpec(project: ProjectModel, model: CatalogModel, options: { languages?: string[] } = {}): GeneratedSpec {
  const all = projectLanguages(project);
  const primary = all[0];
  const files: Record<string, string> = {};
  const languages: SpecLanguage[] = [];
  let main: SpecModel | undefined;
  for (const language of options.languages?.length ? options.languages : all) {
    const { messages, language: labelsLanguage, fallback } = messagesFor(language);
    const mark = (text: string) => `${text} [${messages.untranslatedMark(primary)}]`;
    const spec = buildSpec(project, model, { language, mark });
    if (language === primary) main = spec;
    files[humanFile(language)] = renderHuman(spec, messages);
    languages.push({ language, file: humanFile(language), labelsLanguage, labelsFallback: fallback, untranslated: spec.untranslated, counts: spec.counts });
  }
  const spec = main ?? buildSpec(project, model);
  const labels = messagesFor(primary);
  for (const [file, content] of Object.entries(renderAgent(spec, { labelsLanguage: labels.language, labelsFallback: labels.fallback }))) files[`${AGENT_DIR}/${file}`] = content;
  return { spec, files, languages, labelsLanguage: labels.language, labelsFallback: labels.fallback };
}

/** Writes the files; every <lang>/spec.md, the old root spec.md and agent/ are replaced (no stale files), other files are kept */
export function writeSpec(project: ProjectModel, generated: GeneratedSpec): { dir: string; files: string[] } {
  const dir = specOutputDir(project);
  fs.rmSync(path.join(dir, AGENT_DIR), { recursive: true, force: true });
  fs.rmSync(path.join(dir, HUMAN_FILE), { force: true });
  if (fs.existsSync(dir)) {
    for (const sub of fs.readdirSync(dir, { withFileTypes: true })) if (sub.isDirectory()) fs.rmSync(path.join(dir, sub.name, HUMAN_FILE), { force: true });
  }
  const written = Object.keys(generated.files).sort();
  for (const rel of written) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generated.files[rel]);
  }
  return { dir, files: written };
}
