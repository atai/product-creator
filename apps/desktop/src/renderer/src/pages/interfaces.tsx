import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface Operation {
  key: string;
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  deprecated?: boolean;
}
interface Spec {
  file: string;
  title?: string;
  version?: string;
  operations: Operation[];
  error?: string;
}
interface ServiceInterfaces {
  appId: string;
  appName: string;
  projectId: string;
  specs: Spec[];
}

/** Interface specifications (OpenAPI) of the opened services — first step of PRODUCTCREATOR-9 */
export default function InterfacesPage() {
  const app = useSearchParams().get('app') ?? '';
  const [data, setData] = useState<ServiceInterfaces[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/interfaces${app ? `?app=${encodeURIComponent(app)}` : ''}`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setData(d) : setError(d.error ?? 'Failed to load')))
      .catch((e: unknown) => setError(String(e)));
  }, [app]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">Interfaces</h1>
      <p className="text-gray-600 text-sm mb-6">
        OpenAPI operations provided by services. Next step: link functions to operations (implements / calls) to trace
        features across services and projects.
      </p>
      {error && <div className="text-red-600">{error}</div>}
      {data && data.length === 0 && <p className="text-gray-500">No OpenAPI specs found for the selected services.</p>}
      {data?.map((svc) => (
        <section key={svc.appId} className="bg-white rounded-lg shadow p-5 mb-6">
          <h2 className="text-lg font-semibold">
            {svc.appName} <span className="text-sm text-gray-500 font-normal">{svc.appId}</span>
          </h2>
          {svc.specs.map((spec) => (
            <div key={spec.file} className="mt-3">
              <div className="text-sm font-medium">
                {spec.title ?? 'Untitled'} {spec.version && <span className="text-gray-500">v{spec.version}</span>}
              </div>
              <div className="text-xs text-gray-500 font-mono">{spec.file}</div>
              {spec.error && <div className="text-sm text-red-600">{spec.error}</div>}
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {spec.operations.map((op) => (
                    <tr key={op.key} className={`border-b last:border-0 ${op.deprecated ? 'text-gray-400 line-through' : ''}`}>
                      <td className="py-1 pr-3 font-mono text-xs w-20">{op.method}</td>
                      <td className="py-1 pr-3 font-mono text-xs">{op.path}</td>
                      <td className="py-1 pr-3 text-xs text-gray-500">{op.operationId}</td>
                      <td className="py-1 text-xs">{op.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
