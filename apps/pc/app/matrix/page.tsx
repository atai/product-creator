'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { FunctionCard } from '@/lib/types';

interface MatrixCell {
  exists: boolean;
  functionIds: string[];
}

type Matrix = Record<string, Record<string, MatrixCell>>;

export default function MatrixPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [functions, setFunctions] = useState<FunctionCard[]>([]);
  const [selectedContext, setSelectedContext] = useState<string>('');
  const [matrix, setMatrix] = useState<Matrix>({});
  const [entities, setEntities] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  useEffect(() => {
    // Load functions with root filter from URL
    const rootParam = searchParams.get('root');
    const url = rootParam ? `/api/index?root=${encodeURIComponent(rootParam)}` : '/api/index';

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setFunctions(data);
        setLoading(false);

        // Auto-select first bounded context if available
        if (data.length > 0) {
          const contexts = Array.from(new Set(data.map((f: FunctionCard) => f.bounded_context)));
          if (contexts.length > 0) {
            const firstContext = contexts[0];
            if (typeof firstContext === 'string') {
              setSelectedContext(firstContext);
            }
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load functions', err);
        setLoading(false);
      });
  }, [searchParams]);

  useEffect(() => {
    if (!selectedContext) {
      setMatrix({});
      setEntities([]);
      setActions([]);
      return;
    }

    // Filter functions by selected context
    const contextFunctions = functions.filter((f) => f.bounded_context === selectedContext);

    // Build matrix
    const entitiesSet = new Set<string>();
    const actionsSet = new Set<string>();
    const newMatrix: Matrix = {};

    contextFunctions.forEach((func) => {
      entitiesSet.add(func.entity);
      actionsSet.add(func.action);

      if (!newMatrix[func.action]) {
        newMatrix[func.action] = {};
      }
      if (!newMatrix[func.action][func.entity]) {
        newMatrix[func.action][func.entity] = { exists: false, functionIds: [] };
      }

      newMatrix[func.action][func.entity] = {
        exists: true,
        functionIds: [...newMatrix[func.action][func.entity].functionIds, func.id],
      };
    });

    setEntities(Array.from(entitiesSet).sort());
    setActions(Array.from(actionsSet).sort());
    setMatrix(newMatrix);
  }, [functions, selectedContext]);

  const uniqueContexts = Array.from(new Set(functions.map((f) => f.bounded_context)));

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-4">Function Matrix</h1>
          <p className="text-gray-600 mb-4">
            Verb/Noun matrix showing which actions are implemented for each entity
          </p>

          <div className="flex gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Bounded Context:</label>
            <select
              value={selectedContext}
              onChange={(e) => setSelectedContext(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded bg-white text-gray-900"
            >
              <option value="">Select Context</option>
              {uniqueContexts.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!selectedContext ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <p className="text-yellow-800">Please select a Bounded Context to view the matrix</p>
          </div>
        ) : entities.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded p-4">
            <p className="text-gray-600">No functions found for this context</p>
          </div>
        ) : (
          <div className="bg-white rounded shadow overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-100 z-10">
                    Action \ Entity
                  </th>
                  {entities.map((entity) => (
                    <th
                      key={entity}
                      className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700 min-w-[120px]"
                    >
                      {entity}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <tr key={action} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-3 font-medium text-gray-700 sticky left-0 bg-white">
                      {action}
                    </td>
                    {entities.map((entity) => {
                      const cell = matrix[action]?.[entity];
                      return (
                        <td
                          key={`${action}-${entity}`}
                          className={`border border-gray-300 px-4 py-3 text-center ${
                            cell?.exists ? 'bg-green-50' : 'bg-gray-50'
                          }`}
                        >
                          {cell?.exists ? (
                            <div className="flex flex-col gap-1">
                              {cell.functionIds.map((id) => (
                                <a
                                  key={id}
                                  href={`/f/${id}`}
                                  className="text-green-600 hover:text-green-800 text-xs hover:underline"
                                  title={id}
                                >
                                  ✓
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedContext && entities.length > 0 && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Legend:</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p>
                <span className="inline-block w-4 h-4 bg-green-50 border border-gray-300 mr-2"></span>
                ✓ = Function exists (click to view)
              </p>
              <p>
                <span className="inline-block w-4 h-4 bg-gray-50 border border-gray-300 mr-2"></span>
                — = Function not implemented
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
