import { useEffect, useState } from 'react';
import { getAt, isRec, primaryTexts, setAt, unsetAt, type Rec } from '@pc/core/i18n/text';
import { t, type MessageKey } from '@/i18n';

/**
 * Content languages of a form (PRODUCTCREATOR-37). The project lists its languages (Workspace → project
 * languages); the first is primary and holds the normal fields. Another language edits only the translatable texts
 * (`x-translatable` in the schema) into `i18n.<lang>`; the primary text is shown above each input. Empty = not
 * translated: the spec shows the primary text there.
 */

/** Languages of the project that holds `appId` (a component id or slug), or of the only/first open project */
export function useProjectLanguages(appId?: string): string[] {
  const [languages, setLanguages] = useState<string[]>(['en']);
  useEffect(() => {
    void window.pc.workspace.get().then((info) => {
      const projects = info.projects.flatMap((p) => (p.project ? [p.project] : []));
      const project = projects.find((p) => p.components.some((c) => c.id === appId || c.slug === appId)) ?? projects[0];
      if (!project) return;
      const list = project.languages?.length ? project.languages : [project.spec?.language ?? 'en'];
      setLanguages(list);
    });
  }, [appId]);
  return languages;
}

/** Language tabs: primary first; nothing is shown for a one-language project */
export function LanguageTabs({ languages, value, onChange }: { languages: string[]; value: string; onChange: (language: string) => void }) {
  if (languages.length < 2) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label={t('tr.language')}>
      <span className="text-sm text-muted">{t('tr.language')}:</span>
      {languages.map((l, i) => (
        <button
          key={l}
          type="button"
          role="tab"
          aria-selected={value === l}
          onClick={() => onChange(l)}
          className={`rounded px-3 py-1 text-sm ${value === l ? 'bg-accent text-on' : 'bg-surface-strong text-fg-2 hover:bg-surface-stronger'}`}
        >
          {i === 0 ? t('tr.primary', { language: l }) : l}
        </button>
      ))}
    </div>
  );
}

const label = (path: string[]): string => {
  const field = t(`tr.field.${path[path.length - 1]}` as MessageKey);
  return path.length === 1 ? field : `${t(`tr.list.${path[0]}` as MessageKey)} ${path[1]} · ${field}`;
};

/** Translation inputs of one language for an entry (`entry` is the current primary data, `i18n` its block) */
export function TranslationEditor({
  schema,
  entry,
  i18n,
  language,
  primary,
  onChange,
}: {
  schema: object;
  entry: unknown;
  i18n: Rec | undefined;
  language: string;
  primary: string;
  onChange: (i18n: Rec | undefined) => void;
}) {
  const texts = primaryTexts(entry, schema);
  const block = isRec(i18n?.[language]) ? (i18n?.[language] as Rec) : {};
  const update = (path: string[], value: string) => {
    const next: Rec = JSON.parse(JSON.stringify(i18n ?? {})) as Rec;
    const own: Rec = isRec(next[language]) ? (next[language] as Rec) : {};
    if (value.trim()) setAt(own, path, value);
    else unsetAt(own, path);
    const keys = Object.keys(own).filter((k) => k !== '_source');
    if (keys.length) next[language] = own;
    else delete next[language];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="space-y-4" data-testid="translation-editor">
      <p className="text-sm text-meta">{t('tr.hint', { language, primary })}</p>
      {texts.length === 0 && <p className="text-sm text-muted">{t('tr.nothing')}</p>}
      {texts.map(([path, source]) => {
        const value = getAt(block, path);
        const long = source.length > 80 || source.includes('\n');
        return (
          <label key={path.join('.')} className="block">
            <span className="block text-sm font-medium text-fg-2">{label(path)}</span>
            <span className="mb-1 block whitespace-pre-wrap text-xs text-meta">{source}</span>
            {long ? (
              <textarea className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-fg" rows={3} lang={language} value={typeof value === 'string' ? value : ''} onChange={(e) => update(path, e.target.value)} />
            ) : (
              <input className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-fg" lang={language} value={typeof value === 'string' ? value : ''} onChange={(e) => update(path, e.target.value)} />
            )}
          </label>
        );
      })}
    </div>
  );
}
