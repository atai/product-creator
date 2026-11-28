import Link from 'next/link';
import { t } from '@/i18n';

/** One model problem as returned by /api/validation, /api/validate-plan and rejected saves (PRODUCTCREATOR-29) */
export interface Issue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  kind: 'feature' | 'workflow' | 'business_object' | 'stream' | 'component' | 'project';
  id: string;
  field?: string;
  message: string;
  file?: string;
  component?: string;
  /** design check (PRODUCTCREATOR-34) and its severity in strict mode */
  check?: 'design';
  intended?: 'error' | 'warning' | 'info';
}

const SEVERITY_CLASS: Record<Issue['severity'], string> = {
  error: 'bg-danger-soft text-danger-fg-strong',
  warning: 'bg-warn-muted text-warn-fg',
  info: 'bg-surface-muted text-meta',
};

export function entryHref(kind: Issue['kind'], id: string, app?: string): string {
  const q = app ? `?app=${encodeURIComponent(app)}` : '';
  if (kind === 'feature') return `/features/${encodeURIComponent(id)}${q}`;
  if (kind === 'workflow') return `/workflows/${encodeURIComponent(id)}${q}`;
  if (kind === 'stream') return `/streams/${encodeURIComponent(id)}${q}`;
  if (kind === 'component' || kind === 'project') return `/workspace`;
  return `/business-objects${q}`;
}

export default function ValidationIssues({ issues, app, showEntry = true }: { issues: Issue[]; app?: string; showEntry?: boolean }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-1 text-sm" data-testid="validation-issues">
      {issues.map((i, n) => (
        <li key={`${i.code}-${i.id}-${i.field}-${n}`} className="flex gap-2 items-baseline">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SEVERITY_CLASS[i.severity]}`}>{t(`issues.severity.${i.severity}`)}</span>
          {i.check === 'design' && (
            <span className="px-1.5 py-0.5 rounded text-xs text-meta border border-border" title={`${t('issues.designTitle', { code: i.code })}${i.intended && i.intended !== i.severity ? `; ${t('issues.strictTitle', { level: t(`issues.severity.${i.intended}`) })}` : ''}`}>
              {t('issues.design')}
              {i.intended && i.intended !== i.severity ? ` · ${t('issues.strict', { level: t(`issues.severity.${i.intended}`) })}` : ''}
            </span>
          )}
          {showEntry && (
            <Link href={entryHref(i.kind, i.id, app)} className="font-mono text-xs text-accent hover:underline">
              {i.id}
            </Link>
          )}
          <span className="text-fg-2">
            {i.field && <span className="font-mono text-xs text-meta mr-1">{i.field}:</span>}
            {i.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
