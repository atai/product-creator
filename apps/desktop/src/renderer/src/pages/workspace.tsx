import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  ComponentInput,
  ComponentModel,
  EditResult,
  ProjectModel,
  WorkspaceInfo,
  WorkspaceProjectInfo,
} from '../../../shared/ipc';

/**
 * Desktop: opened projects and the editor of projects, services and libraries.
 * The YAML files in the project folder are the database: product-creator.yml (project) and
 * service.pc.yml / library.pc.yml under catalogRoot (components). Every save writes them.
 */

const input = 'w-full rounded border border-gray-300 px-2 py-1 text-sm';
const btn = 'px-3 py-1.5 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50';
const primary = 'px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700';

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
          <p className="text-gray-600 text-sm mt-1">
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
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {info.projects.length === 0 && <p className="text-gray-500">No projects opened.</p>}
      <div className="space-y-6">
        {info.projects.map((p) => (
          <ProjectCard key={p.root} info={p} editing={editing} setEditing={setEditing} run={run} />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  info: WorkspaceProjectInfo;
  editing: Editing;
  setEditing: (e: Editing) => void;
  run: (action: () => Promise<WorkspaceInfo | EditResult>) => Promise<void>;
}

function ProjectCard({ info, editing, setEditing, run }: CardProps) {
  const { root, project } = info;
  const editingHere = editing?.root === root ? editing : null;
  const newComponent = (kind: ComponentModel['kind']): ComponentInput => ({ kind, slug: '', name: '', path: '' });

  return (
    <section className="bg-white rounded-lg shadow p-5" data-testid="project">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{project?.name ?? root}</h2>
          <div className="text-xs text-gray-500 mt-1 font-mono">{root}</div>
          {project && (
            <div className="text-xs text-gray-500 mt-1">
              id <span className="font-mono">{project.id}</span> · slug <span className="font-mono">{project.slug}</span> ·
              catalogs in <span className="font-mono">{project.catalogRoot}</span>
            </div>
          )}
          {info.origin && info.origin !== 'read' && (
            <div className="text-xs mt-2 text-amber-700">
              {info.origin === 'imported' ? 'Imported from the folder layout on this open' : 'Migrated from product-creator.yml v1'}
              {info.notes?.map((n) => (
                <div key={n}>• {n}</div>
              ))}
            </div>
          )}
          {info.error && <div className="text-sm text-red-600 mt-2">{info.error}</div>}
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
              <h3 className="font-semibold text-gray-700">
                {kind === 'service' ? 'Services' : 'Libraries'} <span className="text-gray-400 font-normal">({list.length})</span>
              </h3>
              {list.length === 0 ? (
                <p className="text-sm text-gray-400 mt-1">None</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
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
                            <div className="text-xs text-gray-500 font-mono">{c.slug}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{c.id}</div>
                          </td>
                          <td className="py-1 pr-3 font-mono text-xs">{c.path}</td>
                          <td className="py-1 pr-3 font-mono text-xs">{c.catalog}</td>
                          <td className="py-1 pr-3 font-mono text-xs">
                            {c.dbSchemaPath && <div>{c.dbSchemaPath}</div>}
                            {c.openapi?.map((s) => <div key={s}>{s}</div>)}
                            {!c.dbSchemaPath && !c.openapi && '—'}
                          </td>
                          <td className="py-1 pr-3 text-xs">
                            {c.dependsOn?.map((d) => project.components.find((x) => x.id === d)?.name ?? d).join(', ') || '—'}
                          </td>
                          <td className="py-1 whitespace-nowrap text-right">
                            <button className="text-blue-600 hover:underline text-xs mr-3" onClick={() => setEditing({ root, type: 'component', component: c })}>
                              Edit
                            </button>
                            <button
                              className="text-red-600 hover:underline text-xs"
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
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

function ProjectForm({ project, onSave, onCancel }: { project: ProjectModel; onSave: (p: Partial<ProjectModel>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: project.name, slug: project.slug, description: project.description ?? '', docs: project.docs ?? '', catalogRoot: project.catalogRoot });
  return (
    <form
      className="mt-4 grid grid-cols-2 gap-3 rounded border border-blue-200 bg-blue-50/40 p-4"
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
  const others = project.components.filter((c) => c.id !== value.id);
  const set = <K extends keyof ComponentInput>(key: K, val: ComponentInput[K]) => setV({ ...v, [key]: val });
  const toggleDep = (id: string) =>
    set('dependsOn', v.dependsOn?.includes(id) ? v.dependsOn.filter((d) => d !== id) : [...(v.dependsOn ?? []), id]);

  return (
    <form
      className="my-3 grid grid-cols-3 gap-3 rounded border border-blue-200 bg-blue-50/40 p-4"
      data-testid="component-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...v, openapi: specs.split('\n').map((s) => s.trim()).filter(Boolean) });
      }}
    >
      <div className="col-span-3 text-sm font-semibold">
        {value.id ? `Edit ${value.kind}` : `New ${v.kind}`}
        {value.id && <span className="ml-2 font-mono text-xs text-gray-500">{value.id}</span>}
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
      <Field label="OpenAPI specs" hint="one path per line, committed files">
        <textarea className={input} rows={2} value={specs} onChange={(e) => setSpecs(e.target.value)} />
      </Field>
      <Field label="Catalog folder" hint={value.id ? 'fixed after creation' : `default: ${project.catalogRoot}/<path>`}>
        <input className={input} value={v.catalog ?? ''} disabled={Boolean(value.id)} onChange={(e) => set('catalog', e.target.value)} />
      </Field>
      <div className="col-span-3">
        <span className="text-xs font-medium text-gray-600">Depends on</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {others.length === 0 && <span className="text-xs text-gray-400">no other components</span>}
          {others.map((c) => (
            <label key={c.id} className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={Boolean(v.dependsOn?.includes(c.id))} onChange={() => toggleDep(c.id)} />
              {c.name} <span className="text-gray-400">({c.kind})</span>
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
