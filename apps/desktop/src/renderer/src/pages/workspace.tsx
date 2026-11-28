import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  ComponentGenerateInfo,
  ComponentInput,
  ComponentModel,
  EditResult,
  GenerateStatus,
  ProjectModel,
  ProjectPatch,
  WorkspaceInfo,
  WorkspaceProjectInfo,
} from '../../../shared/ipc';
import { t } from '@/i18n';
import productSchema from '@pc/core/schema/product.schema.json';
import { LanguageTabs, TranslationEditor } from '@/components/TranslationEditor';

/**
 * Desktop: opened projects and the editor of projects, services and libraries.
 * The YAML files in the project folder are the database: product-creator.yml (project) and
 * service.pc.yml / library.pc.yml under catalogRoot (components). Every save writes them.
 */

const input = 'w-full rounded border border-border-strong px-2 py-1 text-sm';
const btn = 'px-3 py-1.5 rounded border border-border-strong bg-surface text-sm hover:bg-bg';
const primary = 'px-3 py-1.5 rounded bg-accent text-on text-sm hover:bg-accent-hover';

type Editing =
  | { root: string; type: 'project' }
  | { root: string; type: 'component'; component: ComponentInput }
  | null;

export default function WorkspacePage() {
  const [info, setInfo] = useState<WorkspaceInfo>({ projects: [] });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  useEffect(() => {
    void window.pc.workspace.get().then(setInfo);
  }, []);

  const run = async (action: () => Promise<WorkspaceInfo | EditResult>) => {
    try {
      setError(null);
      const result = await action();
      if ('ok' in result) {
        setInfo(result.info);
        if (!result.ok) {
          setError(result.error ?? t('ws.saveFailed'));
          return;
        }
        setEditing(null);
      } else {
        setInfo(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t('ws.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('ws.lead')}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/projects" className={btn} title={t('ws.syncTitle')}>
            {t('ws.sync')}
          </Link>
          <button className={primary} onClick={() => run(() => window.pc.workspace.openDialog())}>
            {t('ws.open')}
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4 rounded border border-danger-border bg-danger-muted p-3 text-sm text-danger-fg" role="alert">
          {error}
        </div>
      )}
      {info.projects.length === 0 && <p className="text-meta">{t('ws.none')}</p>}
      <div className="space-y-6">
        {info.projects.map((p) => (
          <ProjectCard key={p.root} info={p} editing={editing} setEditing={setEditing} run={run} />
        ))}
      </div>
    </div>
  );
}

/** OpenAPI generation state of a project: file status, run status and live logs of its components */
function useOpenApi(root: string, project: ProjectModel | undefined) {
  const [infos, setInfos] = useState<Record<string, ComponentGenerateInfo>>({});
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  const refresh = useCallback(async () => {
    if (!project) return;
    try {
      const list = await window.pc.openapi.info(root);
      setInfos(Object.fromEntries(list.map((i) => [i.componentId, i])));
      setLogs((prev) => ({ ...Object.fromEntries(list.map((i) => [i.componentId, i.status.log])), ...prev }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [root, project]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      window.pc.onOpenApiEvent((event) => {
        if (event.type === 'log') {
          setLogs((prev) => ({ ...prev, [event.componentId]: ((prev[event.componentId] ?? '') + event.chunk).slice(-50_000) }));
          return;
        }
        const { status } = event;
        setInfos((prev) => (prev[status.componentId] ? { ...prev, [status.componentId]: { ...prev[status.componentId], status } } : prev));
        if (status.state === 'running') setLogs((prev) => ({ ...prev, [status.componentId]: '' }));
        else void refresh();
      }),
    [refresh]
  );

  /** Commands come from the project's files: confirm once per session before running them */
  const confirmRun = (commands: string[]): boolean => {
    if (allowed) return true;
    const ok = window.confirm(
      `Run the OpenAPI generate command${commands.length > 1 ? 's' : ''} configured in this project?\n\n${commands.join('\n')}\n\nThe commands run on your machine in the project folder.`
    );
    if (ok) setAllowed(true);
    return ok;
  };

  const generate = async (c: ComponentModel) => {
    if (!c.openapiGenerate || !confirmRun([c.openapiGenerate.command])) return;
    setError(null);
    try {
      await window.pc.openapi.generate(root, c.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const generateAll = async () => {
    const commands = project?.components.flatMap((c) => (c.openapiGenerate ? [c.openapiGenerate.command] : [])) ?? [];
    if (!confirmRun(Array.from(new Set(commands)))) return;
    setError(null);
    try {
      await window.pc.openapi.generateAll(root);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return { infos, logs, error, generate, generateAll, cancel: (id: string) => window.pc.openapi.cancel(id) };
}

const STATE_STYLE: Record<GenerateStatus['state'], string> = {
  idle: 'text-meta',
  running: 'text-accent',
  ok: 'text-success',
  failed: 'text-danger',
  timeout: 'text-danger',
  cancelled: 'text-warn',
};

function formatTime(ms: number | undefined): string {
  return ms ? new Date(ms).toLocaleString() : '—';
}

interface OpenApiCellProps {
  component: ComponentModel;
  info: ComponentGenerateInfo | undefined;
  log: string;
  onGenerate: () => void;
  onCancel: () => void;
}

function OpenApiCell({ component: c, info, log, onGenerate, onCancel }: OpenApiCellProps) {
  const [showLog, setShowLog] = useState(false);
  const status = info?.status;
  const running = status?.state === 'running';
  return (
    <div data-testid="openapi-cell">
      {c.dbSchemaPath && <div className="font-mono text-xs">{c.dbSchemaPath}</div>}
      {info?.specs.map((sp) => (
        <div key={sp.path} className="text-xs">
          <span className="font-mono">{sp.path}</span>{' '}
          <span className="text-meta">
            {sp.exists ? `${sp.operations ?? '?'} ops · ${formatTime(sp.mtime)}` : 'not generated'}
          </span>
        </div>
      ))}
      {!info && c.openapi?.map((sp) => <div key={sp} className="font-mono text-xs">{sp}</div>)}
      {!c.dbSchemaPath && !c.openapi?.length && '—'}
      {c.openapiGenerate && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {running ? (
            <button className="text-xs text-danger hover:underline" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          ) : (
            <button
              className="text-xs rounded border border-border-strong px-2 py-0.5 hover:bg-bg"
              title={c.openapiGenerate.command}
              onClick={onGenerate}
            >
              {t('ws.generateOpenApi')}
            </button>
          )}
          {status && status.state !== 'idle' && (
            <span className={`text-xs ${STATE_STYLE[status.state]}`} title={status.message}>
              {t(`ws.state.${status.state}`)}
              {status.state === 'ok' && status.operations !== undefined ? ` · ${t('ws.ops', { count: status.operations })}` : ''}
              {status.finishedAt ? ` · ${formatTime(status.finishedAt)}` : ''}
            </span>
          )}
          {(log || status?.log) && (
            <button className="text-xs text-accent hover:underline" onClick={() => setShowLog(!showLog)}>
              {showLog ? t('ws.hideLog') : t('ws.log')}
            </button>
          )}
        </div>
      )}
      {status?.message && status.state !== 'ok' && status.state !== 'running' && <div className="text-xs text-danger">{status.message}</div>}
      {showLog && (
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-surface-inverse p-2 text-[11px] leading-snug text-fg-inverse whitespace-pre-wrap">
          {log || status?.log}
        </pre>
      )}
    </div>
  );
}

interface CardProps {
  info: WorkspaceProjectInfo;
  editing: Editing;
  setEditing: (e: Editing) => void;
  run: (action: () => Promise<WorkspaceInfo | EditResult>) => Promise<void>;
}

/**
 * Features were called functions before PRODUCTCREATOR-28: cards in the old `functions/` folder are read as they are;
 * this moves them to `features/` (never overwrites). The window reloads after the change, so the summary is kept in sessionStorage.
 */
function LegacyFeatures({ root, files, run }: { root: string; files: number; run: CardProps['run'] }) {
  const key = `pc.migration.${root}`;
  const [summary] = useState(() => sessionStorage.getItem(key));
  const migrate = () =>
    run(async () => {
      const result = await window.pc.editor.migrateCatalog(root);
      if (result.message) sessionStorage.setItem(key, result.message);
      return result;
    });
  return (
    <>
      {files > 0 && (
        <div className="text-xs mt-2 text-warn-fg" data-testid="legacy-features">
          {t('ws.legacy', { count: files })}
          <button className={`${btn} ml-2`} onClick={() => void migrate()}>
            {t('ws.moveToFeatures')}
          </button>
        </div>
      )}
      {summary && <div className="text-xs mt-2 text-meta whitespace-pre-line">{summary}</div>}
    </>
  );
}

function ProjectCard({ info, editing, setEditing, run }: CardProps) {
  const { root, project } = info;
  const editingHere = editing?.root === root ? editing : null;
  const openapi = useOpenApi(root, project);
  const hasGenerators = Boolean(project?.components.some((c) => c.openapiGenerate));
  const newComponent = (kind: ComponentModel['kind']): ComponentInput => ({ kind, slug: '', name: '', path: '' });

  return (
    <section className="bg-surface rounded-lg shadow p-5" data-testid="project">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{project?.name ?? root}</h2>
          <div className="text-xs text-meta mt-1 font-mono">{root}</div>
          {project && (
            <div className="text-xs text-meta mt-1">
              {t('ws.ids', { id: project.id, slug: project.slug, root: project.catalogRoot })}
            </div>
          )}
          {info.origin && info.origin !== 'read' && (
            <div className="text-xs mt-2 text-warn-fg">
              {info.origin === 'imported' ? t('ws.imported') : t('ws.migrated')}
              {info.notes?.map((n) => (
                <div key={n}>• {n}</div>
              ))}
            </div>
          )}
          {info.error && <div className="text-sm text-danger mt-2">{info.error}</div>}
          {project && <LegacyFeatures root={root} files={info.legacyFeatureFiles ?? 0} run={run} />}
          {openapi.error && <div className="text-sm text-danger mt-2">{openapi.error}</div>}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {project && (
            <>
              <button className={btn} onClick={() => setEditing({ root, type: 'project' })}>
                {t('ws.editProject')}
              </button>
              <button className={btn} onClick={() => setEditing({ root, type: 'component', component: newComponent('service') })}>
                {t('ws.addService')}
              </button>
              <button className={btn} onClick={() => setEditing({ root, type: 'component', component: newComponent('library') })}>
                {t('ws.addLibrary')}
              </button>
              {hasGenerators && (
                <button className={btn} title={t('ws.generateAllTitle')} onClick={() => void openapi.generateAll()}>
                  {t('ws.generateAll')}
                </button>
              )}
              <button
                className={btn}
                title={t('ws.importNewTitle')}
                onClick={() => run(() => window.pc.editor.importNew(root))}
              >
                {t('ws.importNew')}
              </button>
            </>
          )}
          <button className={btn} onClick={() => run(() => window.pc.workspace.close(root))}>
            {t('ws.close')}
          </button>
        </div>
      </div>

      {project && editingHere?.type === 'project' && (
        <ProjectForm project={project} onCancel={() => setEditing(null)} onSave={(patch) => run(() => window.pc.editor.updateProject(root, patch))} />
      )}
      {project && editingHere?.type === 'component' && !editingHere.component.id && (
        <ComponentForm
          project={project}
          value={editingHere.component}
          onCancel={() => setEditing(null)}
          onSave={(c) => run(() => window.pc.editor.saveComponent(root, c))}
        />
      )}

      {project &&
        (['service', 'library'] as const).map((kind) => {
          const list = project.components.filter((c) => c.kind === kind);
          return (
            <div key={kind} className="mt-5">
              <h3 className="font-semibold text-fg-2">
                {kind === 'service' ? t('ws.services') : t('ws.libraries')} <span className="text-meta font-normal">({list.length})</span>
              </h3>
              {list.length === 0 ? (
                <p className="text-sm text-meta mt-1">{t('common.none')}</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left text-meta border-b">
                      <th className="py-1 pr-3">{t('common.name')}</th>
                      <th className="py-1 pr-3">{t('ws.path')}</th>
                      <th className="py-1 pr-3">{t('ws.catalog')}</th>
                      <th className="py-1 pr-3">{t('ws.prismaOpenApi')}</th>
                      <th className="py-1 pr-3">{t('ws.dependsOn')}</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) =>
                      editingHere?.type === 'component' && editingHere.component.id === c.id ? (
                        <tr key={c.id}>
                          <td colSpan={6}>
                            <ComponentForm
                              project={project}
                              value={editingHere.component}
                              onCancel={() => setEditing(null)}
                              onSave={(value) => run(() => window.pc.editor.saveComponent(root, value))}
                            />
                          </td>
                        </tr>
                      ) : (
                        <tr key={c.id} className="border-b last:border-0 align-top">
                          <td className="py-1 pr-3">
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-meta font-mono">{c.slug}</div>
                            <div className="text-[10px] text-meta font-mono">{c.id}</div>
                          </td>
                          <td className="py-1 pr-3 font-mono text-xs">{c.path}</td>
                          <td className="py-1 pr-3 font-mono text-xs">{c.catalog}</td>
                          <td className="py-1 pr-3">
                            <OpenApiCell
                              component={c}
                              info={openapi.infos[c.id]}
                              log={openapi.logs[c.id] ?? ''}
                              onGenerate={() => void openapi.generate(c)}
                              onCancel={() => void openapi.cancel(c.id)}
                            />
                          </td>
                          <td className="py-1 pr-3 text-xs">
                            {c.dependsOn?.map((d) => project.components.find((x) => x.id === d)?.name ?? d).join(', ') || '—'}
                          </td>
                          <td className="py-1 whitespace-nowrap text-right">
                            <button className="text-accent hover:underline text-xs mr-3" onClick={() => setEditing({ root, type: 'component', component: c })}>
                              {t('common.edit')}
                            </button>
                            <button
                              className="text-danger hover:underline text-xs"
                              onClick={() => {
                                if (window.confirm(t('ws.removeConfirm', { name: c.name }))) {
                                  void run(() => window.pc.editor.deleteComponent(root, c.id));
                                }
                              }}
                            >
                              {t('common.remove')}
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-meta">{hint}</span>}
    </label>
  );
}

type Row = Record<string, string>;

/** Editable list of small records (goals, actors, glossary terms) */
function RowsEditor({ rows, columns, onChange, addLabel, newRow }: { rows: Row[]; columns: { key: string; placeholder: string; width?: string }[]; onChange: (rows: Row[]) => void; addLabel: string; newRow: () => Row }) {
  return (
    <div className="space-y-1">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          {columns.map((c) => (
            <input
              key={c.key}
              className={`${input} ${c.width ?? ''}`}
              placeholder={c.placeholder}
              value={row[c.key] ?? ''}
              onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, [c.key]: e.target.value } : r)))}
            />
          ))}
          <button type="button" className={btn} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className={btn} onClick={() => onChange([...rows, newRow()])}>
        {addLabel}
      </button>
    </div>
  );
}

const nextGoalId = (rows: Row[]) => `G${Math.max(0, ...rows.map((r) => Number(r.id?.slice(1)) || 0)) + 1}`;

function ProjectForm({ project, onSave, onCancel }: { project: ProjectModel; onSave: (p: ProjectPatch) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: project.name, slug: project.slug, description: project.description ?? '', docs: project.docs ?? '', catalogRoot: project.catalogRoot });
  // product context (PRODUCTCREATOR-33)
  const [vision, setVision] = useState(project.vision ?? '');
  const [goals, setGoals] = useState<Row[]>((project.goals ?? []).map((g) => ({ ...g })));
  const [actors, setActors] = useState<Row[]>((project.actors ?? []).map((a) => ({ id: a.id, name: a.name, description: a.description ?? '' })));
  const [glossary, setGlossary] = useState<Row[]>((project.glossary ?? []).map((t) => ({ ...t })));
  // external systems (PRODUCTCREATOR-43): event lists are comma-separated in the form
  const [systems, setSystems] = useState<Row[]>((project.systems ?? []).map((x) => ({ id: x.id, name: x.name, description: x.description ?? '', emits: (x.emits ?? []).join(', '), consumes: (x.consumes ?? []).join(', ') })));
  const events = (text: string | undefined) => (text ?? '').split(/[\s,]+/).filter(Boolean);
  const [issueUrl, setIssueUrl] = useState(project.tracker?.issueUrl ?? '');
  const [specOutput, setSpecOutput] = useState(project.spec?.output ?? '');
  // content and spec languages (PRODUCTCREATOR-37); the old spec.language becomes the only language
  const [languages, setLanguages] = useState((project.languages?.length ? project.languages : project.spec?.language ? [project.spec.language] : []).join(', '));
  const [perLanguage, setPerLanguage] = useState(Boolean(project.screenshots?.perLanguage));
  const [i18n, setI18n] = useState<Record<string, unknown> | undefined>(project.i18n);
  const [language, setLanguage] = useState('');
  const languageList = languages.split(/[\s,]+/).filter(Boolean);
  const primary = languageList[0] ?? 'en';
  const translating = Boolean(language && language !== primary && languageList.includes(language));
  const filled = (rows: Row[], keys: string[]) => rows.filter((r) => keys.every((k) => r[k]?.trim()));
  return (
    <form
      className="mt-4 grid grid-cols-2 gap-3 rounded border border-accent-border bg-accent-soft/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...v,
          vision,
          goals: filled(goals, ['id', 'text']).map((g) => ({ id: g.id.trim(), text: g.text.trim() })),
          actors: filled(actors, ['id', 'name']).map((a) => ({ id: a.id.trim(), name: a.name.trim(), ...(a.description?.trim() ? { description: a.description.trim() } : {}) })),
          glossary: filled(glossary, ['term', 'definition']).map((t) => ({ term: t.term.trim(), definition: t.definition.trim() })),
          systems: filled(systems, ['id', 'name']).map((x) => ({
            id: x.id.trim(),
            name: x.name.trim(),
            ...(x.description?.trim() ? { description: x.description.trim() } : {}),
            ...(events(x.emits).length ? { emits: events(x.emits) } : {}),
            ...(events(x.consumes).length ? { consumes: events(x.consumes) } : {}),
          })),
          tracker: issueUrl.trim() ? { issueUrl: issueUrl.trim() } : null,
          spec: specOutput.trim() ? { output: specOutput.trim() } : null,
          languages: languageList,
          i18n: i18n ?? null,
          ...(project.screenshots ? { screenshots: { ...project.screenshots, perLanguage: perLanguage || undefined } } : {}),
        });
      }}
    >
      <div className="col-span-2">
        <LanguageTabs languages={languageList} value={translating ? language : primary} onChange={setLanguage} />
      </div>
      {translating && (
        <div className="col-span-2">
          <TranslationEditor
            schema={productSchema}
            entry={{ description: v.description, vision, goals, actors, systems, glossary }}
            i18n={i18n}
            language={language}
            primary={primary}
            onChange={setI18n}
          />
        </div>
      )}
      <div className={translating ? 'hidden' : 'col-span-2 grid grid-cols-2 gap-3'}>
      <Field label={t('common.name')}>
        <input className={input} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
      </Field>
      <Field label={t('ws.slug')} hint={t('ws.slugHint')}>
        <input className={input} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />
      </Field>
      <Field label={t('common.description')}>
        <input className={input} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field label={t('ws.docs')}>
        <input className={input} value={v.docs} onChange={(e) => setV({ ...v, docs: e.target.value })} />
      </Field>
      <Field label={t('ws.catalogRoot')} hint={t('ws.catalogRootHint')}>
        <input className={input} value={v.catalogRoot} onChange={(e) => setV({ ...v, catalogRoot: e.target.value })} />
      </Field>
      <Field label={t('ws.issueUrl')} hint={t('ws.issueUrlHint')}>
        <input className={input} value={issueUrl} placeholder="https://example.youtrack.cloud/issue/{id}" onChange={(e) => setIssueUrl(e.target.value)} />
      </Field>

      <Field label={t('ws.languages')} hint={t('ws.languagesHint')}>
        <input className={input} value={languages} placeholder="en, ru" onChange={(e) => setLanguages(e.target.value)} />
      </Field>
      <Field label={t('ws.specOutput')} hint={t('ws.specOutputHint')}>
        <input className={input} value={specOutput} placeholder="docs/spec" onChange={(e) => setSpecOutput(e.target.value)} />
      </Field>
      {project.screenshots && languageList.length > 1 && (
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={perLanguage} onChange={(e) => setPerLanguage(e.target.checked)} />
          {t('ws.perLanguageScreens')} <span className="text-[11px] text-meta">{t('ws.perLanguageScreensHint')}</span>
        </label>
      )}

      <div className="col-span-2 mt-2 border-t border-border pt-3 text-sm font-semibold">{t('ws.product')}</div>
      <div className="col-span-2">
        <Field label={t('ws.vision')} hint={t('ws.visionHint')}>
          <textarea className={input} rows={2} value={vision} onChange={(e) => setVision(e.target.value)} />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label={t('ws.goals')} hint="G1, G2, …">
          <RowsEditor rows={goals} onChange={setGoals} addLabel={t('ws.addGoal')} newRow={() => ({ id: nextGoalId(goals), text: '' })} columns={[{ key: 'id', placeholder: 'G1', width: 'w-16' }, { key: 'text', placeholder: t('ws.goalPlaceholder') }]} />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label={t('ws.actors')} hint={t('ws.actorsHint')}>
          <RowsEditor rows={actors} onChange={setActors} addLabel={t('ws.addActor')} newRow={() => ({ id: '', name: '', description: '' })} columns={[{ key: 'id', placeholder: 'ai_agent', width: 'w-40' }, { key: 'name', placeholder: t('ws.actorName'), width: 'w-48' }, { key: 'description', placeholder: t('ws.actorWho') }]} />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label={t('ws.systems')} hint={t('ws.systemsHint')}>
          <RowsEditor
            rows={systems}
            onChange={setSystems}
            addLabel={t('ws.addSystem')}
            newRow={() => ({ id: '', name: '', description: '', emits: '', consumes: '' })}
            columns={[
              { key: 'id', placeholder: 'glitchtip', width: 'w-32' },
              { key: 'name', placeholder: t('ws.systemName'), width: 'w-36' },
              { key: 'description', placeholder: t('ws.actorWho') },
              { key: 'emits', placeholder: t('ws.systemEmits') },
              { key: 'consumes', placeholder: t('ws.systemConsumes') },
            ]}
          />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label={t('ws.glossary')}>
          <RowsEditor rows={glossary} onChange={setGlossary} addLabel={t('ws.addTerm')} newRow={() => ({ term: '', definition: '' })} columns={[{ key: 'term', placeholder: t('ws.term'), width: 'w-48' }, { key: 'definition', placeholder: t('ws.definition') }]} />
        </Field>
      </div>
      </div>

      <div className="col-span-2 flex items-end justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className={primary}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

function ComponentForm({
  project,
  value,
  onSave,
  onCancel,
}: {
  project: ProjectModel;
  value: ComponentInput;
  onSave: (c: ComponentInput) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<ComponentInput>(value);
  const [specs, setSpecs] = useState((value.openapi ?? []).join('\n'));
  const [gen, setGen] = useState({
    command: value.openapiGenerate?.command ?? '',
    cwd: value.openapiGenerate?.cwd ?? '',
    timeoutSec: value.openapiGenerate?.timeoutSec ? String(value.openapiGenerate.timeoutSec) : '',
  });
  const others = project.components.filter((c) => c.id !== value.id);
  const set = <K extends keyof ComponentInput>(key: K, val: ComponentInput[K]) => setV({ ...v, [key]: val });
  const toggleDep = (id: string) =>
    set('dependsOn', v.dependsOn?.includes(id) ? v.dependsOn.filter((d) => d !== id) : [...(v.dependsOn ?? []), id]);

  return (
    <form
      className="my-3 grid grid-cols-3 gap-3 rounded border border-accent-border bg-accent-soft/40 p-4"
      data-testid="component-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...v,
          openapi: specs.split('\n').map((s) => s.trim()).filter(Boolean),
          openapiGenerate: gen.command.trim()
            ? { command: gen.command.trim(), cwd: gen.cwd.trim() || undefined, timeoutSec: gen.timeoutSec ? Number(gen.timeoutSec) : undefined }
            : undefined,
        });
      }}
    >
      <div className="col-span-3 text-sm font-semibold">
        {value.id ? t('ws.editComponent', { kind: t(`ws.kind.${value.kind}`) }) : t('ws.newComponent', { kind: t(`ws.kind.${v.kind}`) })}
        {value.id && <span className="ml-2 font-mono text-xs text-meta">{value.id}</span>}
      </div>
      <Field label={t('common.name')}>
        <input className={input} value={v.name} onChange={(e) => set('name', e.target.value)} required />
      </Field>
      <Field label={t('ws.slug')} hint={t('ws.componentSlugHint')}>
        <input className={input} value={v.slug} placeholder={t('ws.fromName')} onChange={(e) => set('slug', e.target.value)} />
      </Field>
      <Field label={t('ws.kind')}>
        <select className={input} value={v.kind} onChange={(e) => set('kind', e.target.value as ComponentInput['kind'])}>
          <option value="service">{t('ws.kind.service')}</option>
          <option value="library">{t('ws.kind.library')}</option>
        </select>
      </Field>
      <Field label={t('ws.sourcePath')} hint={t('ws.sourcePathHint')}>
        <input className={input} value={v.path} placeholder="apps/api" onChange={(e) => set('path', e.target.value)} required />
      </Field>
      <Field label={t('ws.codeBase')} hint={t('ws.codeBaseHint')}>
        <input className={input} value={v.codeBasePath ?? ''} onChange={(e) => set('codeBasePath', e.target.value)} />
      </Field>
      <Field label={t('ws.prisma')}>
        <input className={input} value={v.dbSchemaPath ?? ''} onChange={(e) => set('dbSchemaPath', e.target.value)} />
      </Field>
      <Field label={t('common.description')}>
        <input className={input} value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label={t('ws.openapiSpecs')} hint={t('ws.openapiSpecsHint')}>
        <textarea className={input} rows={2} value={specs} onChange={(e) => setSpecs(e.target.value)} />
      </Field>
      <div className="col-span-3 grid grid-cols-3 gap-3 rounded border border-border bg-surface/60 p-3">
        <div className="col-span-3 text-xs font-medium text-muted">
          {t('ws.openapiGeneration')} <span className="font-normal text-meta">{t('ws.openapiGenerationLead')}</span>
        </div>
        <div className="col-span-3">
          <Field label={t('ws.command')} hint={t('ws.commandHint')}>
            <input
              className={`${input} font-mono`}
              value={gen.command}
              placeholder="pnpm run generate:openapi"
              onChange={(e) => setGen({ ...gen, command: e.target.value })}
            />
          </Field>
        </div>
        <Field label={t('ws.cwd')} hint={t('ws.cwdHint', { path: v.path || t('ws.sourcePathShort') })}>
          <input className={input} value={gen.cwd} onChange={(e) => setGen({ ...gen, cwd: e.target.value })} />
        </Field>
        <Field label={t('ws.timeout')} hint={t('ws.timeoutHint')}>
          <input className={input} type="number" min={1} max={3600} value={gen.timeoutSec} onChange={(e) => setGen({ ...gen, timeoutSec: e.target.value })} />
        </Field>
      </div>
      <Field label={t('ws.catalogFolder')} hint={value.id ? t('ws.catalogFixed') : t('ws.catalogDefault', { path: `${project.catalogRoot}/<path>` })}>
        <input className={input} value={v.catalog ?? ''} disabled={Boolean(value.id)} onChange={(e) => set('catalog', e.target.value)} />
      </Field>
      <div className="col-span-3">
        <span className="text-xs font-medium text-muted">{t('ws.dependsOn')}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {others.length === 0 && <span className="text-xs text-meta">{t('ws.noOthers')}</span>}
          {others.map((c) => (
            <label key={c.id} className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={Boolean(v.dependsOn?.includes(c.id))} onChange={() => toggleDep(c.id)} />
              {c.name} <span className="text-meta">({t(`ws.kind.${c.kind}`)})</span>
            </label>
          ))}
        </div>
      </div>
      <div className="col-span-3 flex justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className={primary}>
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}
