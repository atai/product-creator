import { useEffect, useState } from 'react';
import Link from 'next/link';
import { entryHref } from './ValidationIssues';
import { t } from '@/i18n';

interface Ref {
  id: string;
  name?: string;
  via: string;
}
interface Impact {
  exists: boolean;
  features: Ref[];
  workflows: Ref[];
  objects: Ref[];
  calls: Ref[];
}

/** What changing a feature or business object affects (GET /api/impact, PRODUCTCREATOR-29) */
export default function ImpactPanel({ kind, id, app }: { kind: 'feature' | 'business_object'; id: string; app?: string }) {
  const [impact, setImpact] = useState<Impact | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/impact?kind=${kind}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => alive && setImpact(data))
      .catch(() => alive && setImpact(null));
    return () => {
      alive = false;
    };
  }, [kind, id]);
  if (!impact) return null;

  const section = (title: string, refs: Ref[], target: 'feature' | 'workflow' | 'business_object') =>
    refs.length > 0 && (
      <div>
        <h4 className="text-xs font-semibold text-meta uppercase mb-1">{title}</h4>
        <ul className="space-y-1 text-sm">
          {refs.map((r) => (
            <li key={`${title}-${r.id}`}>
              <Link href={entryHref(target, r.id, app)} className="font-mono text-xs text-accent hover:underline">
                {r.id}
              </Link>
              {r.name && <span className="ml-2">{r.name}</span>}
              <span className="ml-2 text-xs text-meta">{r.via}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  const empty = !impact.features.length && !impact.workflows.length && !impact.objects.length && !impact.calls.length;
  return (
    <section className="mt-6" data-testid="impact">
      <h3 className="text-sm font-medium text-meta mb-2">{t('impact.title')}</h3>
      {empty ? (
        <p className="text-sm text-meta">
          {kind === 'business_object' ? t('impact.noFeatureUsesObject') : t('impact.notUsed')}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {section(kind === 'business_object' ? t('impact.featuresUsing') : t('impact.featuresCalling'), impact.features, 'feature')}
          {section(t('impact.workflows'), impact.workflows, 'workflow')}
          {section(kind === 'business_object' ? t('impact.objectsReferencing') : t('impact.objects'), impact.objects, 'business_object')}
          {section(t('impact.calls'), impact.calls, 'feature')}
        </div>
      )}
    </section>
  );
}
