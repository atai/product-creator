'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Workflow } from '@/lib/types';
import { useEntityList } from '@/hooks/useEntityList';

export default function WorkflowsPage() {
  const searchParams = useSearchParams();
  const selectedRoot = searchParams.get('root') || '';

  // Refactored to use generic hook - eliminates duplication
  const {
    items: workflows,
    filteredItems: filteredWorkflows,
    loading,
    searchQuery,
    setSearchQuery,
  } = useEntityList<Workflow>('/api/workflows', (workflow) => [
    workflow.workflow,
    workflow.name || '',
    ...workflow.steps,
  ]);

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Workflows</h1>
          <Link
            href={`/workflows/new${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            New Workflow
          </Link>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading workflows...</p>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">
              {workflows.length === 0 ? 'No workflows found. Create your first workflow!' : 'No matching workflows found.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Workflow ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Steps
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Events Emitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWorkflows.map((workflow) => (
                  <tr key={workflow.workflow} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/workflows/${workflow.workflow}${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        {workflow.workflow}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                      {workflow.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">
                        {workflow.steps.length} step{workflow.steps.length !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {workflow.emits && workflow.emits.length > 0 ? (
                          workflow.emits.map((event) => (
                            <span
                              key={event}
                              className="inline-block px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded"
                            >
                              {event}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/workflows/${workflow.workflow}${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
