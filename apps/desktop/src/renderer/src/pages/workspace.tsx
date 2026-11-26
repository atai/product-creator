import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { WorkspaceInfo } from '../../../shared/ipc';

/** Desktop: opened projects (multi-project workspace) and their services */
export default function WorkspacePage() {
  const [info, setInfo] = useState<WorkspaceInfo>({ projects: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.pc.workspace.get().then(setInfo);
  }, []);

  const run = async (action: () => Promise<WorkspaceInfo>) => {
    try {
      setError(null);
      setInfo(await action());
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
            Opened project folders. Services come from <code>product-creator.yml</code> or are discovered from the
            repository layout (pnpm workspace / package.json workspaces).
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/projects"
            className="px-4 py-2 rounded border border-gray-300 bg-white text-sm hover:bg-gray-50"
            title="Sync functions from code and business objects from the Prisma schema"
          >
            Sync code / schema…
          </Link>
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={() => run(() => window.pc.workspace.openDialog())}
          >
            Open project folder…
          </button>
        </div>
      </div>
      {error && <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {info.projects.length === 0 && <p className="text-gray-500">No projects opened.</p>}
      <div className="space-y-6">
        {info.projects.map((p) => (
          <section key={p.root} className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {p.name ?? p.root} {p.id && <span className="text-sm text-gray-500 font-normal">({p.id})</span>}
                </h2>
                <div className="text-xs text-gray-500 mt-1 font-mono">{p.root}</div>
                {p.source && (
                  <div className="text-xs mt-1">
                    {p.source === 'file' ? 'product-creator.yml' : 'discovered from repository layout'}
                  </div>
                )}
                {p.error && <div className="text-sm text-red-600 mt-2">{p.error}</div>}
              </div>
              <div className="flex gap-2">
                {p.source === 'discovered' && (
                  <button
                    className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50"
                    onClick={() => run(() => window.pc.workspace.writeManifest(p.root))}
                    title="Save the discovered services to product-creator.yml in the project root"
                  >
                    Write product-creator.yml
                  </button>
                )}
                <button
                  className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50"
                  onClick={() => run(() => window.pc.workspace.close(p.root))}
                >
                  Close
                </button>
              </div>
            </div>
            {p.services && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-1 pr-3">Service</th>
                    <th className="py-1 pr-3">Path</th>
                    <th className="py-1 pr-3">Catalog</th>
                    <th className="py-1 pr-3">Prisma</th>
                    <th className="py-1">OpenAPI</th>
                  </tr>
                </thead>
                <tbody>
                  {p.services.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 align-top">
                      <td className="py-1 pr-3">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-gray-500">{s.id}</div>
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs">{s.path}</td>
                      <td className="py-1 pr-3 font-mono text-xs">{s.catalog}</td>
                      <td className="py-1 pr-3 font-mono text-xs">{s.dbSchemaPath ?? '—'}</td>
                      <td className="py-1 font-mono text-xs">{s.openapi?.join(', ') ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
