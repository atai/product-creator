import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CatalogPageLayout from '@/components/CatalogPageLayout';
import ValidationIssues, { type Issue } from '@/components/ValidationIssues';

/** Model problems of the catalog (GET /api/validation, PRODUCTCREATOR-29) */
export default function ProblemsPage() {
  const searchParams = useSearchParams();
  const app = searchParams.get('app') || '';
  const [data, setData] = useState<{ errors: number; warnings: number; issues: Issue[] } | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);

  useEffect(() => {
    fetch(app ? `/api/validation?app=${encodeURIComponent(app)}` : '/api/validation')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ errors: 0, warnings: 0, issues: [] }));
  }, [app]);

  const issues = (data?.issues ?? []).filter((i) => showWarnings || i.severity === 'error');
  return (
    <CatalogPageLayout
      title="Problems"
      description="Проверка модели: шаги workflow и calls ссылаются на существующие фичи, objects фич — на бизнес-объекты, типы полей — на скаляры или объекты; дубли id и имён. Сохранение, которое добавляет ошибку, отклоняется."
      actions={
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={showWarnings} onChange={(e) => setShowWarnings(e.target.checked)} />
          Show warnings
        </label>
      }
    >
      {!data ? (
        <div className="text-center py-12 text-muted">Checking the model...</div>
      ) : (
        <div className="bg-surface rounded-lg shadow p-6 space-y-4">
          <div className="text-sm" data-testid="problem-counts">
            <strong>{data.errors}</strong> error(s), <strong>{data.warnings}</strong> warning(s)
            {app ? ' in the selected component' : ' in all open projects'}
          </div>
          {issues.length === 0 ? <div className="text-sm text-meta">No problems.</div> : <ValidationIssues issues={issues} app={app || undefined} />}
        </div>
      )}
    </CatalogPageLayout>
  );
}
