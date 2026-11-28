import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { WorkspaceProjectInfo } from '../../../shared/ipc';
import { t } from '@/i18n';

/**
 * Doc page (PRODUCTCREATOR-35): the human view of the spec generated from the catalog, the same Markdown that
 * `product-creator spec` writes to spec.output. Raw HTML in the catalog is not rendered (react-markdown default).
 */
interface SpecResponse {
  project: { id: string; name: string };
  language: string;
  languages: string[];
  primary: string;
  untranslated: number;
  labelsLanguage: string;
  labelsFallback: boolean;
  counts: { errors: number; warnings: number };
  output?: string;
  markdown: string;
  error?: string;
}

interface ScreensStatus {
  configured: boolean;
  screens: number;
  running: boolean;
  log: string;
  report?: { state: string; message?: string; requested: number; captured: number; failed: { feature: string; id: string; error?: string }[] };
}

/** Images of the spec are files next to spec.md; the renderer gets them as data URLs through the API */
function SpecImage({ projectId, src, alt }: { projectId: string; src?: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    // spec.md lives in <lang>/: its images are ../screens/…, served relative to the spec folder
    void fetch(`/api/spec?project=${encodeURIComponent(projectId)}&asset=${encodeURIComponent(src.replace(/^\.\.\//, ''))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { dataUrl?: string } | null) => setUrl(b?.dataUrl ?? null));
  }, [projectId, src]);
  return url ? <img src={url} alt={alt} className="my-3 max-w-full rounded border border-border shadow-sm" /> : <span className="text-sm text-meta">[{alt}]</span>;
}

const md: Components = {
  h1: ({ children }) => <h1 className="text-3xl font-bold text-fg mb-4">{children}</h1>,
  h2: ({ children }) => <h2 className="text-2xl font-semibold text-fg mt-10 mb-3 border-b border-border pb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xl font-semibold text-fg mt-8 mb-2">{children}</h3>,
  h4: ({ children }) => <h4 className="text-lg font-semibold text-fg mt-6 mb-1">{children}</h4>,
  p: ({ children }) => <p className="text-fg-2 my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 my-2 space-y-1 text-fg-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 my-2 space-y-1 text-fg-2">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-3 rounded border-l-4 border-warn-border-strong bg-warn-soft px-4 py-2 text-warn-fg">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-sm">{children}</code>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent-fg underline">
      {children}
    </a>
  ),
  table: ({ children }) => <table className="my-3 w-full border-collapse text-sm">{children}</table>,
  th: ({ children }) => <th className="border border-border bg-surface-muted px-2 py-1 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
};

export default function DocPage() {
  const [projects, setProjects] = useState<WorkspaceProjectInfo[]>([]);
  const [projectId, setProjectId] = useState('');
  const [spec, setSpec] = useState<SpecResponse | null>(null);
  const [error, setError] = useState('');
  const [written, setWritten] = useState('');
  const [language, setLanguage] = useState('');
  const [screens, setScreens] = useState<ScreensStatus | null>(null);

  useEffect(() => {
    void window.pc.workspace.get().then((info) => {
      const open = info.projects.filter((p) => p.project);
      setProjects(open);
      setProjectId((current) => current || open[0]?.project?.id || '');
    });
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError('');
    const res = await fetch(`/api/spec?project=${encodeURIComponent(projectId)}${language ? `&language=${encodeURIComponent(language)}` : ''}`);
    const body = (await res.json()) as SpecResponse;
    if (!res.ok) setError(body.error ?? t('doc.loadFailed'));
    else setSpec(body);
  }, [projectId, language]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadScreens = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/screens?project=${encodeURIComponent(projectId)}`);
    if (res.ok) setScreens((await res.json()) as ScreensStatus);
  }, [projectId]);

  useEffect(() => {
    void loadScreens();
  }, [loadScreens]);

  // poll while a capture runs; regenerate the spec when it ends
  useEffect(() => {
    if (!screens?.running) return;
    const timer = setInterval(() => {
      void fetch(`/api/screens?project=${encodeURIComponent(projectId)}`)
        .then((r) => r.json())
        .then((s: ScreensStatus) => {
          setScreens(s);
          if (!s.running) void load();
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [screens?.running, projectId, load]);

  const capture = async () => {
    setError('');
    const res = await fetch('/api/screens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: projectId }) });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? t('doc.captureFailed'));
    await loadScreens();
  };

  const cancelCapture = async () => {
    await fetch(`/api/screens?project=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  };

  const write = async () => {
    setWritten('');
    const res = await fetch('/api/spec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: projectId }) });
    const body = (await res.json()) as { dir?: string; files?: string[]; error?: string };
    if (!res.ok) setError(body.error ?? t('doc.writeFailed'));
    else setWritten(t('doc.written', { count: body.files?.length ?? 0, dir: body.dir ?? '' }));
  };

  return (
    <div className="min-h-full bg-bg">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {projects.length > 1 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2 border border-border-strong rounded bg-surface text-fg">
              {projects.map((p) => (
                <option key={p.root} value={p.project?.id}>
                  {p.project?.name}
                </option>
              ))}
            </select>
          )}
          {spec && spec.languages.length > 1 && (
            <select value={spec.language} onChange={(e) => setLanguage(e.target.value)} title={t('doc.language')} className="px-3 py-2 border border-border-strong rounded bg-surface text-fg">
              {spec.languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => void load()} className="px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm">
            {t('doc.regenerate')}
          </button>
          <button type="button" onClick={() => void write()} disabled={!spec?.output} className="px-3 py-2 bg-accent text-on rounded hover:bg-accent-hover disabled:bg-surface-disabled text-sm">
            {t('doc.writeFiles')}
            {spec?.output ? '' : ` ${t('doc.outputNotAllowed')}`}
          </button>
          {screens?.configured && screens.screens > 0 && (
            <button type="button" onClick={() => void (screens.running ? cancelCapture() : capture())} className="px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm">
              {screens.running ? t('doc.cancelCapture') : t('doc.captureScreens', { count: screens.screens })}
            </button>
          )}
          {spec && (
            <span className="text-sm text-meta">
              {t('doc.status', { errors: spec.counts.errors, warnings: spec.counts.warnings })}
              {spec.untranslated ? ` · ${t('doc.untranslated', { count: spec.untranslated, primary: spec.primary })}` : ''}
              {spec.labelsFallback ? ` (${t('doc.labelsFallback', { language: spec.labelsLanguage })})` : ''}
            </span>
          )}
        </div>
        {screens?.report && !screens.running && (
          <div className={`mb-4 rounded px-4 py-2 text-sm ${screens.report.state === 'ok' && !screens.report.failed.length ? 'bg-success-muted text-success-fg' : 'bg-warn-soft text-warn-fg'}`}>
            {t('doc.screenshots', { state: screens.report.state })}
            {screens.report.message ? ` — ${screens.report.message}` : ''} · {t('doc.withImage', { captured: screens.report.captured, requested: screens.report.requested })}
            {screens.report.failed.map((f) => (
              <div key={`${f.feature}#${f.id}`}>
                {f.feature} {f.id}: {f.error ?? t('doc.failed')}
              </div>
            ))}
          </div>
        )}
        {(screens?.running || (screens?.report && screens.report.state !== 'ok')) && screens.log && (
          <pre className="mb-4 max-h-64 overflow-auto rounded bg-surface-muted p-3 text-xs">{screens.log}</pre>
        )}
        {written && <div className="mb-4 rounded bg-success-muted px-4 py-2 text-sm text-success-fg">{written}</div>}
        {error && <div className="mb-4 rounded bg-danger-soft px-4 py-2 text-sm text-danger-fg-strong">{error}</div>}
        {!projects.length && <p className="text-muted">{t('doc.openProject')}</p>}
        {spec && (
          <article className="rounded-lg bg-surface p-8 shadow">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ ...md, img: ({ src, alt }) => <SpecImage projectId={projectId} src={typeof src === 'string' ? src : undefined} alt={alt} /> }}>
              {spec.markdown}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
