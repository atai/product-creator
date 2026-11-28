'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Stream } from '@pc/core/types';
import { useEntityList } from '@/hooks/useEntityList';
import CatalogPageLayout from '@/components/CatalogPageLayout';
import { t } from '@/i18n';
import LifecycleBadge from '@/components/LifecycleBadge';

export default function StreamsPage() {
  const searchParams = useSearchParams();
  const selectedApp = searchParams.get('app') || '';

  // Refactored to use generic hook - eliminates duplication
  const {
    items: streams,
    filteredItems: filteredStreams,
    loading,
    searchQuery,
    setSearchQuery,
  } = useEntityList<Stream>(
    '/api/streams',
    (stream) => [
    stream.stream,
    stream.name || '',
    stream.goal,
    ],
    { app: selectedApp }
  );

  return (
    <CatalogPageLayout
      title={t('streams.title')}
      description={t('streams.description')}
      hintKey="streams"
      actions={
        <Link
          href={`/streams/new${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
          className="px-4 py-2 bg-accent text-on rounded hover:bg-accent-hover text-sm font-medium"
        >
          {t('streams.new')}
        </Link>
      }
      search={
        <input
          type="text"
          placeholder={t('streams.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      }
    >
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted">{t('streams.loading')}</p>
        </div>
      ) : filteredStreams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted">
            {streams.length === 0 ? t('streams.noneYet') : t('streams.noMatch')}
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-bg">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('streams.colId')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('common.name')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('streams.colLifecycle')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('streams.colGoal')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('streams.colStages')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('streams.colKpis')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-border">
              {filteredStreams.map((stream) => (
                <tr key={stream.stream} className="hover:bg-bg">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/streams/${stream.stream}${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
                      className="text-accent hover:text-accent-fg-strong font-medium"
                    >
                      {stream.stream}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-fg">
                    {stream.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {stream.lifecycle ? <LifecycleBadge lifecycle={stream.lifecycle} /> : <span className="text-xs text-danger">{t('workflows.missing')}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-muted max-w-md truncate">
                      {stream.goal}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-muted">
                      {t('streams.stages', { count: stream.stages.length })}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {stream.kpis && stream.kpis.length > 0 ? (
                        stream.kpis.map((kpi) => (
                          <span
                            key={kpi.id}
                            title={kpi.target}
                            className="inline-block px-2 py-1 text-xs font-medium bg-success-muted text-success-fg rounded"
                          >
                            {kpi.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-meta">{t('common.none')}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Link
                      href={`/streams/${stream.stream}${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
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
