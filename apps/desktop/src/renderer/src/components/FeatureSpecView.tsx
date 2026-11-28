import type { Feature } from '@pc/core/types';

/** Read-only spec of a feature (PRODUCTCREATOR-32): actors, requirements, acceptance, constraints, decisions, open questions */
export default function FeatureSpecView({ feature }: { feature: Feature }) {
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
      {actors.length > 0 && section('Actors', <p className="text-fg-2">{actors.join(', ')}</p>)}
      {requirements.length > 0 &&
        section(
          'Requirements',
          <ul className="space-y-1">
            {requirements.map((r) => (
              <li key={r.id} id={r.id}>
                {tag(r.id)}
                {r.text}
                {r.priority && r.priority !== 'must' && <span className="ml-2 text-xs text-meta">({r.priority})</span>}
              </li>
            ))}
          </ul>
        )}
      {acceptance.length > 0 &&
        section(
          'Acceptance criteria',
          <ul className="space-y-2">
            {acceptance.map((a) => (
              <li key={a.id} id={a.id}>
                {tag(a.id)}
                {a.covers?.length ? <span className="text-xs text-meta mr-2">covers {a.covers.join(', ')}</span> : null}
                {a.text && <span>{a.text}</span>}
                {(a.given || a.when || a.then) && (
                  <div className="ml-6 text-sm text-fg-2">
                    {a.given && <div><b>Given</b> {a.given}</div>}
                    {a.when && <div><b>When</b> {a.when}</div>}
                    {a.then && <div><b>Then</b> {a.then}</div>}
                  </div>
                )}
                {a.verify && <div className="ml-6 font-mono text-xs text-meta">verify: {a.verify}</div>}
              </li>
            ))}
          </ul>
        )}
      {constraints.length > 0 &&
        section(
          'Constraints',
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
          'Decisions',
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
          'Open questions',
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
