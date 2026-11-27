import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  ComponentGenerateInfo,
  ComponentInput,
  ComponentModel,
  EditResult,
  GenerateStatus,
  ProjectModel,
  WorkspaceInfo,
  WorkspaceProjectInfo,
} from '../../../shared/ipc';

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
          setError(result.error ?? 'Save failed');
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
          <h1 className="text-3xl font-bold">Workspace</h1>
          <p className="text-muted text-sm mt-1">
            Opened projects with their services and libraries. Changes are saved to <code>product-creator.yml</code>{' '}
            and <code>*.pc.yml</code> files in the project folder.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/projects" className={btn} title="Sync functions from code and business objects from the Prisma schema">
            Sync code / schema…
          </Link>
          <button className={primary} onClick={() => run(() => window.pc.workspace.openDialog())}>
            Open project folder…
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4 rounded border border-danger-border bg-danger-muted p-3 text-sm text-danger-fg" role="alert">
          {error}
        </div>
      )}
      {info.projects.length === 0 && <p className="text-meta">No projects opened.</p>}
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
              Cancel
            </button>
          ) : (
            <button
              className="text-xs rounded border border-border-strong px-2 py-0.5 hover:bg-bg"
              title={c.openapiGenerate.command}
              onClick={onGenerate}
            >
              Generate OpenAPI
            </button>
          )}
          {status && status.state !== 'idle' && (
            <span className={`text-xs ${STATE_STYLE[status.state]}`} title={status.message}>
              {status.state}
              {status.state === 'ok' && status.operations !== undefined ? ` · ${status.operations} ops` : ''}
              {status.finishedAt ? ` · ${formatTime(status.finishedAt)}` : ''}
            </span>
          )}
          {(log || status?.log) && (
            <button className="text-xs text-accent hover:underline" onClick={() => setShowLog(!showLog)}>
              {showLog ? 'Hide log' : 'Log'}
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
          {files} feature card(s) are in the old <span className="font-mono">functions/</span> folder (read as features).
          <button className={`${btn} ml-2`} onClick={() => void migrate()}>
            Move to features/
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
              id <span className="font-mono">{project.id}</span> · slug <span className="font-mono">{project.slug}</span> ·
              catalogs in <span className="font-mono">{project.catalogRoot}</span>
            </div>
          )}
          {info.origin && info.origin !== 'read' && (
            <div className="text-xs mt-2 text-warn-fg">
              {info.origin === 'imported' ? 'Imported from the folder layout on this open' : 'Migrated from product-creator.yml v1'}
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
                Edit project
              </button>
              <button className={btn} onClick={() => setEditing({ root, type: 'component', component: newComponent('service') })}>
                Add service
              </button>
              <button className={btn} onClick={() => setEditing({ root, type: 'component', component: newComponent('library') })}>
                Add library
              </button>
              {hasGenerators && (
                <button className={btn} title="Run the configured OpenAPI generate command of every component" onClick={() => void openapi.generateAll()}>
                  Generate all OpenAPI
                </button>
              )}
              <button
                className={btn}
                title="Add components found in the folder layout (pnpm workspace) that are not in the project yet"
                onClick={() => run(() => window.pc.editor.importNew(root))}
              >
                Import new from folder
              </button>
            </>
          )}
          <button className={btn} onClick={() => run(() => window.pc.workspace.close(root))}>
            Close
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
                {kind === 'service' ? 'Services' : 'Libraries'} <span className="text-meta font-normal">({list.length})</span>
              </h3>
              {list.length === 0 ? (
                <p className="text-sm text-meta mt-1">None</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left text-meta border-b">
                      <th className="py-1 pr-3">Name</th>
                      <th className="py-1 pr-3">Path</th>
                      <th className="py-1 pr-3">Catalog</th>
                      <th className="py-1 pr-3">Prisma / OpenAPI</th>
                      <th className="py-1 pr-3">Depends on</th>
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
                              Edit
                            </button>
                            <button
                              className="text-danger hover:underline text-xs"
                              onClick={() => {
                                if (window.confirm(`Remove ${c.name} from the project? Its catalog files are kept.`)) {
                                  void run(() => window.pc.editor.deleteComponent(root, c.id));
                                }
                              }}
                            >
                              Remove
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

function ProjectForm({ project, onSave, onCancel }: { project: ProjectModel; onSave: (p: Partial<ProjectModel>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: project.name, slug: project.slug, description: project.description ?? '', docs: project.docs ?? '', catalogRoot: project.catalogRoot });
  return (
    <form
      className="mt-4 grid grid-cols-2 gap-3 rounded border border-accent-border bg-accent-soft/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <Field label="Name">
        <input className={input} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
      </Field>
      <Field label="Slug" hint="a-z, 0-9, -; the id stays the same when renamed">
        <input className={input} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />
      </Field>
      <Field label="Description">
        <input className={input} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field label="Sphinx docs folder">
        <input className={input} value={v.docs} onChange={(e) => setV({ ...v, docs: e.target.value })} />
      </Field>
      <Field label="Catalog root" hint="folder with component catalogs">
        <input className={input} value={v.catalogRoot} onChange={(e) => setV({ ...v, catalogRoot: e.target.value })} />
      </Field>
      <div className="flex items-end justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primary}>
          Save
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
        {value.id ? `Edit ${value.kind}` : `New ${v.kind}`}
        {value.id && <span className="ml-2 font-mono text-xs text-meta">{value.id}</span>}
      </div>
      <Field label="Name">
        <input className={input} value={v.name} onChange={(e) => set('name', e.target.value)} required />
      </Field>
      <Field label="Slug" hint="unique in the project; renaming keeps the id">
        <input className={input} value={v.slug} placeholder="from name" onChange={(e) => set('slug', e.target.value)} />
      </Field>
      <Field label="Kind">
        <select className={input} value={v.kind} onChange={(e) => set('kind', e.target.value as ComponentInput['kind'])}>
          <option value="service">service</option>
          <option value="library">library</option>
        </select>
      </Field>
      <Field label="Source path" hint="relative to the project root">
        <input className={input} value={v.path} placeholder="apps/api" onChange={(e) => set('path', e.target.value)} required />
      </Field>
      <Field label="Code base for sync" hint="default: source path">
        <input className={input} value={v.codeBasePath ?? ''} onChange={(e) => set('codeBasePath', e.target.value)} />
      </Field>
      <Field label="Prisma schema">
        <input className={input} value={v.dbSchemaPath ?? ''} onChange={(e) => set('dbSchemaPath', e.target.value)} />
      </Field>
      <Field label="Description">
        <input className={input} value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="OpenAPI specs" hint="one path per line: committed files or the output of the command">
        <textarea className={input} rows={2} value={specs} onChange={(e) => setSpecs(e.target.value)} />
      </Field>
      <div className="col-span-3 grid grid-cols-3 gap-3 rounded border border-border bg-surface/60 p-3">
        <div className="col-span-3 text-xs font-medium text-muted">
          OpenAPI generation <span className="font-normal text-meta">— optional; the command runs on your machine when you press “Generate OpenAPI”</span>
        </div>
        <div className="col-span-3">
          <Field label="Command" hint="e.g. pnpm run generate:openapi — executed as written; list its output file in “OpenAPI specs” above">
            <input
              className={`${input} font-mono`}
              value={gen.command}
              placeholder="pnpm run generate:openapi"
              onChange={(e) => setGen({ ...gen, command: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Working directory" hint={`relative to the project root; default: ${v.path || 'source path'}`}>
          <input className={input} value={gen.cwd} onChange={(e) => setGen({ ...gen, cwd: e.target.value })} />
        </Field>
        <Field label="Timeout, seconds" hint="default 120">
          <input className={input} type="number" min={1} max={3600} value={gen.timeoutSec} onChange={(e) => setGen({ ...gen, timeoutSec: e.target.value })} />
        </Field>
      </div>
      <Field label="Catalog folder" hint={value.id ? 'fixed after creation' : `default: ${project.catalogRoot}/<path>`}>
        <input className={input} value={v.catalog ?? ''} disabled={Boolean(value.id)} onChange={(e) => set('catalog', e.target.value)} />
      </Field>
      <div className="col-span-3">
        <span className="text-xs font-medium text-muted">Depends on</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {others.length === 0 && <span className="text-xs text-meta">no other components</span>}
          {others.map((c) => (
            <label key={c.id} className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={Boolean(v.dependsOn?.includes(c.id))} onChange={() => toggleDep(c.id)} />
              {c.name} <span className="text-meta">({c.kind})</span>
            </label>
          ))}
        </div>
      </div>
      <div className="col-span-3 flex justify-end gap-2">
        <button type="button" className={btn} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={primary}>
          Save
        </button>
      </div>
    </form>
  );
}
