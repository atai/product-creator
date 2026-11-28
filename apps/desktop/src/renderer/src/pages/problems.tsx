import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CatalogPageLayout from '@/components/CatalogPageLayout';
import ValidationIssues, { type Issue } from '@/components/ValidationIssues';
import { t } from '@/i18n';

/** Model problems of the catalog (GET /api/validation, PRODUCTCREATOR-29) */
export default function ProblemsPage() {
  const searchParams = useSearchParams();
  const app = searchParams.get('app') || '';
  const [data, setData] = useState<{ errors: number; warnings: number; infos: number; issues: Issue[] } | null>(null);
  /** lowest severity shown */
  const [level, setLevel] = useState<Issue['severity']>('warning');
  const [designOnly, setDesignOnly] = useState(false);

  useEffect(() => {
    fetch(app ? `/api/validation?app=${encodeURIComponent(app)}` : '/api/validation')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ errors: 0, warnings: 0, infos: 0, issues: [] }));
  }, [app]);

  const rank: Record<Issue['severity'], number> = { error: 0, warning: 1, info: 2 };
  const issues = (data?.issues ?? []).filter((i) => rank[i.severity] <= rank[level] && (!designOnly || i.check === 'design')).sort((a, b) => rank[a.severity] - rank[b.severity]);
  return (
    <CatalogPageLayout
      title={t('problems.title')}
      description={t('problems.description')}
      actions={
        <div className="flex items-center gap-4 text-sm">
          <select value={level} onChange={(e) => setLevel(e.target.value as Issue['severity'])} className="border border-border-strong rounded px-2 py-1 bg-surface">
            <option value="error">{t('problems.errors')}</option>
            <option value="warning">{t('problems.errorsWarnings')}</option>
            <option value="info">{t('problems.everything')}</option>
          </select>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={designOnly} onChange={(e) => setDesignOnly(e.target.checked)} />
            {t('problems.designOnly')}
          </label>
        </div>
      }
    >
      {!data ? (
        <div className="text-center py-12 text-muted">{t('problems.checking')}</div>
      ) : (
        <div className="bg-surface rounded-lg shadow p-6 space-y-4">
          <div className="text-sm" data-testid="problem-counts">
            <strong>{t('problems.counts', { errors: data.errors, warnings: data.warnings, infos: data.infos ?? 0 })}</strong> {app ? t('problems.inComponent') : t('problems.inAll')}
          </div>
          {issues.length === 0 ? <div className="text-sm text-meta">{t('problems.none')}</div> : <ValidationIssues issues={issues} app={app || undefined} />}
        </div>
      )}
    </CatalogPageLayout>
  );
}
