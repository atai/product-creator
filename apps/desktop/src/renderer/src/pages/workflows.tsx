'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Workflow } from '@pc/core/types';
import { useEntityList } from '@/hooks/useEntityList';
import CatalogPageLayout from '@/components/CatalogPageLayout';

export default function WorkflowsPage() {
  const searchParams = useSearchParams();
  const selectedApp = searchParams.get('app') || '';

  // Refactored to use generic hook - eliminates duplication
  const {
    items: workflows,
    filteredItems: filteredWorkflows,
    loading,
    searchQuery,
    setSearchQuery,
  } = useEntityList<Workflow>(
    '/api/workflows',
    (workflow) => [
    workflow.workflow,
    workflow.name || '',
    ...workflow.steps,
    ],
    { app: selectedApp }
  );

  return (
    <CatalogPageLayout
      title="Workflows"
      description="Workflow-сценарии, которые оркестрируют фичи и события. Проверяйте шаги, emitted events и переходите к редактированию."
      hintKey="workflows"
      actions={
        <Link
          href={`/workflows/new${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
          className="px-4 py-2 bg-accent text-on rounded hover:bg-accent-hover text-sm font-medium"
        >
          New Workflow
        </Link>
      }
      search={
        <input
          type="text"
          placeholder="Search workflows..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      }
    >
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted">Loading workflows...</p>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted">
            {workflows.length === 0 ? 'No workflows found. Create your first workflow!' : 'No matching workflows found.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-bg">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Workflow ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Steps
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Events Emitted
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-border">
              {filteredWorkflows.map((workflow) => (
                <tr key={workflow.workflow} className="hover:bg-bg">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/workflows/${workflow.workflow}${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
                      className="text-accent hover:text-accent-fg-strong font-medium"
                    >
                      {workflow.workflow}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-fg">
                    {workflow.name || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-muted">
                      {workflow.steps.length} step{workflow.steps.length !== 1 ? 's' : ''}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {workflow.emits && workflow.emits.length > 0 ? (
                        workflow.emits.map((event) => (
                          <span
                            key={event}
                            className="inline-block px-2 py-1 text-xs font-medium bg-secondary-muted text-secondary-fg rounded"
                          >
                            {event}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-meta">None</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Link
                      href={`/workflows/${workflow.workflow}${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
                      className="text-accent hover:text-accent-fg-strong"
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
    </CatalogPageLayout>
  );
}
