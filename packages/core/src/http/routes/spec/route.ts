import * as fs from 'fs';
import * as path from 'path';
import { getStorage, type FunctionStorage } from '../../../storage';
import logger from '../../../logger';
import { readProject, type ProjectModel } from '../../../project/model';
import { AGENT_DIR, generateSpec, humanFile, specOutputDir, writeSpec } from '../../../spec';
import { primaryLanguage, projectLanguages } from '../../../project/model';

/** Project of the request: `project` (id), or the only open project */
function projectOf(storage: FunctionStorage, id: string | null): ProjectModel | Response {
  const ids = id ? [id] : storage.getAllProjects().map((p) => p.id);
  if (ids.length !== 1) return Response.json({ error: 'project is required (several projects are open)' }, { status: 400 });
  const root = storage.getProjectRoot(ids[0]);
  const project = root ? readProject(root) : null;
  return project ?? Response.json({ error: `project "${ids[0]}" not found` }, { status: 404 });
}

/**
 * GET /api/spec?project=<id>[&language=<tag>][&entry=<path>] (PRODUCTCREATOR-35, -37)
 *   no entry: the human view (markdown) in `language` (default: primary) with counts, languages and the output folder
 *   entry=manifest.json | features/<id>.json | …: one file of the agent bundle
 * Nothing is written.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const storage = await getStorage();
    const project = projectOf(storage, url.searchParams.get('project'));
    if (project instanceof Response) return project;
    // an image of the spec folder for the Doc page (PRODUCTCREATOR-36): PNG only, inside spec.output
    const asset = url.searchParams.get('asset');
    if (asset) {
      const dir = specOutputDir(project);
      const file = path.resolve(dir, asset);
      if (!file.startsWith(dir + path.sep) || !file.endsWith('.png') || !fs.existsSync(file)) return Response.json({ error: `no image "${asset}"` }, { status: 404 });
      return Response.json({ dataUrl: `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` });
    }
    const entry = url.searchParams.get('entry');
    const requested = url.searchParams.get('language');
    const language = requested && projectLanguages(project).includes(requested) ? requested : primaryLanguage(project);
    const generated = generateSpec(project, storage.modelSnapshot(), { languages: entry ? [primaryLanguage(project)] : [language] });
    if (entry) {
      const content = generated.files[`${AGENT_DIR}/${entry}`];
      if (content === undefined) return Response.json({ error: `no entry "${entry}" in the agent bundle; read manifest.json for the list` }, { status: 404 });
      return Response.json(JSON.parse(content));
    }
    let output: string | undefined;
    try {
      output = specOutputDir(project);
    } catch {
      output = undefined;
    }
    const info = generated.languages[0];
    return Response.json({
      project: { id: project.id, name: project.name },
      language,
      languages: projectLanguages(project),
      primary: primaryLanguage(project),
      labelsLanguage: info.labelsLanguage,
      labelsFallback: info.labelsFallback,
      untranslated: info.untranslated,
      counts: info.counts,
      output,
      markdown: generated.files[humanFile(language)],
    });
  } catch (error) {
    logger.error('Failed to generate the spec', { error });
    return Response.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/spec { project? }: write <lang>/spec.md per project language and agent/ to spec.output (default docs/spec) */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { project?: string };
    const storage = await getStorage();
    const project = projectOf(storage, body.project ?? null);
    if (project instanceof Response) return project;
    const generated = generateSpec(project, storage.modelSnapshot());
    const written = writeSpec(project, generated);
    return Response.json({ ...written, counts: generated.spec.counts, languages: generated.languages.map((l) => l.language) });
  } catch (error) {
    logger.error('Failed to write the spec', { error });
    return Response.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 400 });
  }
}
