'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Workflow } from '@pc/core/types';
import { useEntityList } from '@/hooks/useEntityList';
import CatalogPageLayout from '@/components/CatalogPageLayout';
import LifecycleBadge from '../components/LifecycleBadge';
import { t } from '@/i18n';

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
      title={t('workflows.title')}
      description={t('workflows.description')}
      hintKey="workflows"
      actions={
        <Link
          href={`/workflows/new${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
          className="px-4 py-2 bg-accent text-on rounded hover:bg-accent-hover text-sm font-medium"
        >
          {t('workflows.new')}
        </Link>
      }
      search={
        <input
          type="text"
          placeholder={t('workflows.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      }
    >
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted">{t('workflows.loading')}</p>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted">
            {workflows.length === 0 ? t('workflows.noneYet') : t('workflows.noMatch')}
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-bg">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('workflows.colId')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('common.name')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('common.lifecycle')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('workflows.colSteps')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('workflows.colEvents')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('common.actions')}
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    {workflow.lifecycle ? <LifecycleBadge lifecycle={workflow.lifecycle} /> : <span className="text-xs text-danger">{t('workflows.missing')}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-muted">
                      {t('workflows.steps', { count: workflow.steps.length })}
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
                        <span className="text-sm text-meta">{t('common.none')}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Link
                      href={`/workflows/${workflow.workflow}${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
                      className="text-accent hover:text-accent-fg-strong"
                    >
                      {t('common.edit')}
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
