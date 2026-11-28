import { useEffect, useState } from 'react';
import type { Feature } from '@pc/core/types';
import { t } from '@/i18n';

/**
 * Issue link template of the open projects (PRODUCTCREATOR-33). Used only when exactly one tracker is configured:
 * with several, a key cannot be attributed to a project here and is shown without a link.
 */
function useIssueUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void window.pc.workspace.get().then((info) => {
      const urls = [...new Set(info.projects.flatMap((p) => (p.project?.tracker ? [p.project.tracker.issueUrl] : [])))];
      setUrl(urls.length === 1 ? urls[0] : null);
    });
  }, []);
  return url;
}

/** Names of the actors defined in product-creator.yml of the open projects, by id (first project wins on a clash) */
function useActorNames(): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void window.pc.workspace.get().then((info) => {
      const map = new Map<string, string>();
      for (const p of info.projects) for (const a of p.project?.actors ?? []) if (!map.has(a.id)) map.set(a.id, a.name);
      setNames(map);
    });
  }, []);
  return names;
}

/** Tickets and other places of the implementation (PRODUCTCREATOR-33) */
export function FeatureLinksView({ feature }: { feature: Feature }) {
  const issueUrl = useIssueUrl();
  const { tickets = [], code_refs = [] } = feature;
  return (
    <>
      {tickets.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-meta mb-2">{t('spec.tickets')}</h3>
          <div className="flex flex-wrap gap-2">
            {tickets.map((t) =>
              issueUrl ? (
                <a key={t} href={issueUrl.replace('{id}', encodeURIComponent(t.replace(/^#/, '')))} target="_blank" rel="noreferrer" className="font-mono text-sm text-accent-fg underline">
                  {t}
                </a>
              ) : (
                <span key={t} className="font-mono text-sm">
                  {t}
                </span>
              )
            )}
          </div>
        </div>
      )}
      {code_refs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-meta mb-2">{t('spec.alsoImplementedIn')}</h3>
          <ul className="space-y-1 text-sm">
            {code_refs.map((c) => (
              <li key={`${c.component}:${c.file}:${c.symbol ?? ''}`}>
                <span className="text-xs text-meta mr-2">{c.component}</span>
                <span className="font-mono">{c.file}</span>
                {c.symbol && <span className="font-mono text-meta"> #{c.symbol}</span>}
                {c.role && <span className="ml-2 text-xs text-meta">({c.role})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Read-only spec of a feature (PRODUCTCREATOR-32): actors, requirements, acceptance, constraints, decisions, open questions */
export default function FeatureSpecView({ feature }: { feature: Feature }) {
  const actorNames = useActorNames();
  const { actors = [], requirements = [], acceptance = [], constraints = [], decisions = [], open_questions = [] } = feature;
  if (![actors, requirements, acceptance, constraints, decisions, open_questions].some((l) => l.length)) return null;
  const tag = (id: string) => <span className="font-mono text-xs text-meta mr-2">{id}</span>;
  const section = (title: string, body: React.ReactNode) => (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-meta mb-2">{title}</h3>
      {body}
    </div>
  );

  return (
    <>
      {actors.length > 0 &&
        section(
          t('spec.actors'),
          <p className="text-fg-2">
            {actors.map((id, i) => (
              <span key={id} title={id}>
                {i > 0 ? ', ' : ''}
                {actorNames.get(id) ?? id}
              </span>
            ))}
          </p>
        )}
      {requirements.length > 0 &&
        section(
          t('spec.requirements'),
          <ul className="space-y-1">
            {requirements.map((r) => (
              <li key={r.id} id={r.id}>
                {tag(r.id)}
                {r.text}
                {r.priority && r.priority !== 'must' && <span className="ml-2 text-xs text-meta">({t(`spec.priority.${r.priority}`)})</span>}
              </li>
            ))}
          </ul>
        )}
      {acceptance.length > 0 &&
        section(
          t('spec.acceptance'),
          <ul className="space-y-2">
            {acceptance.map((a) => (
              <li key={a.id} id={a.id}>
                {tag(a.id)}
                {a.covers?.length ? <span className="text-xs text-meta mr-2">{t('spec.covers', { ids: a.covers.join(', ') })}</span> : null}
                {a.text && <span>{a.text}</span>}
                {(a.given || a.when || a.then) && (
                  <div className="ml-6 text-sm text-fg-2">
                    {a.given && <div><b>{t('spec.given')}</b> {a.given}</div>}
                    {a.when && <div><b>{t('spec.when')}</b> {a.when}</div>}
                    {a.then && <div><b>{t('spec.then')}</b> {a.then}</div>}
                  </div>
                )}
                {a.verify && <div className="ml-6 font-mono text-xs text-meta">{t('spec.verify', { command: a.verify })}</div>}
              </li>
            ))}
          </ul>
        )}
      {constraints.length > 0 &&
        section(
          t('spec.constraints'),
          <ul className="space-y-1">
            {constraints.map((c) => (
              <li key={c.id}>
                {tag(c.id)}
                {c.kind && <span className="text-xs text-meta mr-2">{c.kind}</span>}
                {c.text}
              </li>
            ))}
          </ul>
        )}
      {decisions.length > 0 &&
        section(
          t('spec.decisions'),
          <ul className="space-y-2">
            {decisions.map((d) => (
              <li key={d.id} className={d.status === 'superseded' ? 'line-through text-meta' : undefined}>
                {tag(d.id)}
                {d.decision}
                {d.date && <span className="ml-2 text-xs text-meta">{d.date}</span>}
                {d.reason && <div className="ml-6 text-sm text-fg-2">{d.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      {open_questions.length > 0 &&
        section(
          t('spec.openQuestions'),
          <ul className="space-y-1">
            {open_questions.map((q) => (
              <li key={q.id}>
                {tag(q.id)}
                {q.question}
                {q.owner && <span className="ml-2 text-xs text-meta">— {q.owner}</span>}
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
