import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { WorkspaceProjectInfo } from '../../../shared/ipc';

/**
 * Doc page (PRODUCTCREATOR-35): the human view of the spec generated from the catalog, the same Markdown that
 * `product-creator spec` writes to spec.output. Raw HTML in the catalog is not rendered (react-markdown default).
 */
interface SpecResponse {
  project: { id: string; name: string };
  language: string;
  labelsLanguage: string;
  labelsFallback: boolean;
  counts: { errors: number; warnings: number };
  output?: string;
  markdown: string;
  error?: string;
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
    const res = await fetch(`/api/spec?project=${encodeURIComponent(projectId)}`);
    const body = (await res.json()) as SpecResponse;
    if (!res.ok) setError(body.error ?? 'Failed to generate the spec');
    else setSpec(body);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const write = async () => {
    setWritten('');
    const res = await fetch('/api/spec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: projectId }) });
    const body = (await res.json()) as { dir?: string; files?: string[]; error?: string };
    if (!res.ok) setError(body.error ?? 'Failed to write the spec');
    else setWritten(`${body.files?.length ?? 0} file(s) written to ${body.dir}`);
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
          <button type="button" onClick={() => void load()} className="px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm">
            Regenerate
          </button>
          <button type="button" onClick={() => void write()} disabled={!spec?.output} className="px-3 py-2 bg-accent text-on rounded hover:bg-accent-hover disabled:bg-surface-disabled text-sm">
            Write files{spec?.output ? '' : ' (output folder not allowed)'}
          </button>
          {spec && (
            <span className="text-sm text-meta">
              {spec.counts.errors} error(s), {spec.counts.warnings} warning(s) · language {spec.language}
              {spec.labelsFallback ? ` (labels: ${spec.labelsLanguage})` : ''}
            </span>
          )}
        </div>
        {written && <div className="mb-4 rounded bg-success-muted px-4 py-2 text-sm text-success-fg">{written}</div>}
        {error && <div className="mb-4 rounded bg-danger-soft px-4 py-2 text-sm text-danger-fg-strong">{error}</div>}
        {!projects.length && <p className="text-muted">Open a project to generate its spec.</p>}
        {spec && (
          <article className="rounded-lg bg-surface p-8 shadow">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
              {spec.markdown}
            </ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
}
