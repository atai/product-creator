'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray, Controller, type Control } from 'react-hook-form';
import { LIFECYCLES, type Feature, type Lifecycle, type Stream, type StreamStage, type Workflow } from '@pc/core/types';
import streamSchema from '@pc/core/schema/stream.schema.json';
import FormHelpHint from '@/components/FormHelpHint';
import { LanguageTabs, TranslationEditor, useProjectLanguages } from '@/components/TranslationEditor';
import { t } from '@/i18n';

/**
 * Stream editor (PRODUCTCREATOR-43): a business process across stages. Each stage starts and ends with events and
 * names what does its work: features, workflows, and actors or external systems of the project. Fields the form
 * does not edit are saved back unchanged; texts are translated on the language tabs.
 */

/** A stage in the form: event lists are comma-separated text */
interface StageForm {
  id: string;
  name: string;
  entry_events: string;
  exit_events: string;
  features: string[];
  workflows: string[];
  performed_by: string[];
}

interface StreamFormData {
  stream: string;
  name: string;
  goal: string;
  description: string;
  lifecycle: Lifecycle;
  owner: string;
  /** comma-separated issue keys */
  tickets: string;
  kpis: { id: string; name: string; target: string }[];
  stages: StageForm[];
}

interface Option {
  id: string;
  label: string;
}

const input = 'w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg focus:ring-2 focus:ring-accent disabled:bg-surface-muted';
const list = (text: string) => text.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
/** Next free id with a prefix: K1, K2 … / ST1, ST2 … */
const nextId = (prefix: string, ids: string[]) => `${prefix}${Math.max(0, ...ids.map((id) => Number(id.slice(prefix.length)) || 0)) + 1}`;

const toStageForm = (s: StreamStage): StageForm => ({
  id: s.id,
  name: s.name,
  entry_events: (s.entry_events ?? []).join(', '),
  exit_events: (s.exit_events ?? []).join(', '),
  features: s.features ?? [],
  workflows: s.workflows ?? [],
  performed_by: s.performed_by ?? [],
});

const fromStageForm = (s: StageForm): StreamStage => {
  const stage: StreamStage = { id: s.id, name: s.name.trim(), entry_events: list(s.entry_events), exit_events: list(s.exit_events) };
  if (s.features.length) stage.features = s.features;
  if (s.workflows.length) stage.workflows = s.workflows;
  if (s.performed_by.length) stage.performed_by = s.performed_by;
  return stage;
};

/** Chips of chosen ids with a select to add one of the known ids */
function IdPicker({ value, onChange, options, label }: { value: string[]; onChange: (v: string[]) => void; options: Option[]; label: string }) {
  const name = new Map(options.map((o) => [o.id, o.label]));
  const free = options.filter((o) => !value.includes(o.id));
  return (
    <div>
      <span className="block text-xs font-medium text-muted mb-1">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded bg-surface-strong px-2 py-0.5 text-xs">
            <span title={id}>{name.get(id) ?? id}</span>
            <button type="button" aria-label={t('common.remove')} className="text-danger" onClick={() => onChange(value.filter((v) => v !== id))}>
              ✕
            </button>
          </span>
        ))}
        {free.length > 0 && (
          <select aria-label={label} className="rounded border border-border-strong bg-surface px-2 py-0.5 text-xs" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
            <option value="">{t('st.pick')}</option>
            {free.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function StageEditor({ control, index, remove, features, workflows, performers }: { control: Control<StreamFormData>; index: number; remove: () => void; features: Option[]; workflows: Option[]; performers: Option[] }) {
  return (
    <Controller
      control={control}
      name={`stages.${index}`}
      render={({ field }) => {
        const stage = field.value;
        const set = (patch: Partial<StageForm>) => field.onChange({ ...stage, ...patch });
        return (
          <div className="space-y-3 rounded border border-border bg-bg p-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-medium text-fg">{t('st.stageTitle', { id: stage.id })}</h3>
              <button type="button" onClick={remove} className="text-sm text-danger hover:text-danger-fg-strong">
                {t('st.removeStage')}
              </button>
            </div>
            <label className="block">
              <span className="block text-sm font-medium text-fg-2 mb-1">{t('st.stageName')}</span>
              <input className={input} value={stage.name} placeholder={t('st.stageNameHint')} onChange={(e) => set({ name: e.target.value })} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm font-medium text-fg-2 mb-1">{t('st.entryEvents')}</span>
                <input className={`${input} font-mono text-sm`} value={stage.entry_events} placeholder={t('st.eventsHint')} onChange={(e) => set({ entry_events: e.target.value })} required />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-fg-2 mb-1">{t('st.exitEvents')}</span>
                <input className={`${input} font-mono text-sm`} value={stage.exit_events} placeholder={t('st.eventsHint')} onChange={(e) => set({ exit_events: e.target.value })} required />
              </label>
            </div>
            <p className="text-xs text-meta">{t('st.workHint')}</p>
            <IdPicker label={t('st.features')} value={stage.features} options={features} onChange={(v) => set({ features: v })} />
            <IdPicker label={t('st.workflowsLabel')} value={stage.workflows} options={workflows} onChange={(v) => set({ workflows: v })} />
            <IdPicker label={t('st.performedBy')} value={stage.performed_by} options={performers} onChange={(v) => set({ performed_by: v })} />
          </div>
        );
      }}
    />
  );
}

export default function StreamEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const streamId = params.id as string;
  const isNew = streamId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string>('');
  /** The card as loaded: fields the form does not edit are saved back unchanged */
  const [loaded, setLoaded] = useState<Stream | null>(null);
  const [i18n, setI18n] = useState<Stream['i18n']>(undefined);
  const [language, setLanguage] = useState('');
  const languages = useProjectLanguages(selectedApp || undefined);
  const primary = languages[0];
  const translating = Boolean(language && language !== primary);
  const [features, setFeatures] = useState<Option[]>([]);
  const [workflows, setWorkflows] = useState<Option[]>([]);
  const [performers, setPerformers] = useState<Option[]>([]);

  const { register, control, handleSubmit, reset, watch, getValues, formState: { errors } } = useForm<StreamFormData>({
    defaultValues: { stream: '', name: '', goal: '', description: '', lifecycle: 'draft', owner: '', tickets: '', kpis: [], stages: [] },
  });
  const kpis = useFieldArray({ control, name: 'kpis' });
  const stages = useFieldArray({ control, name: 'stages', keyName: 'key' });

  // what a stage can name: features and workflows of the catalog, actors and systems of the project
  useEffect(() => {
    void fetch('/api/features').then((r) => r.json()).then((d: Feature[]) => setFeatures(Array.isArray(d) ? d.map((f) => ({ id: f.id, label: `${f.name} (${f.id})` })).sort((a, b) => a.id.localeCompare(b.id)) : []));
    void fetch('/api/workflows').then((r) => r.json()).then((d: Workflow[]) => setWorkflows(Array.isArray(d) ? d.map((w) => ({ id: w.workflow, label: `${w.name ?? w.workflow} (${w.workflow})` })) : []));
    void window.pc.workspace.get().then((info) => {
      const all = info.projects.flatMap((p) => [
        ...(p.project?.actors ?? []).map((a) => ({ id: a.id, label: `${a.name} — ${t('st.actor')}` })),
        ...(p.project?.systems ?? []).map((x) => ({ id: x.id, label: `${x.name} — ${t('st.system')}` })),
      ]);
      setPerformers([...new Map(all.map((o) => [o.id, o])).values()]);
    });
  }, []);

  const loadStream = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/stream?id=${encodeURIComponent(streamId)}`);
      if (!response.ok) throw new Error(t('st.notFound'));
      const stream: Stream = await response.json();
      setLoaded(stream);
      setI18n(stream.i18n);
      reset({
        stream: stream.stream,
        name: stream.name ?? '',
        goal: stream.goal ?? '',
        description: stream.description ?? '',
        lifecycle: stream.lifecycle ?? 'draft',
        owner: stream.owner ?? '',
        tickets: (stream.tickets ?? []).join(', '),
        kpis: (stream.kpis ?? []).map((k) => ({ id: k.id, name: k.name, target: k.target ?? '' })),
        stages: (stream.stages ?? []).map(toStageForm),
      });
    } catch (e) {
      console.error('Error loading stream:', e);
      setError(t('st.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [streamId, reset]);

  useEffect(() => {
    const appParam = searchParams.get('app');
    if (appParam) setSelectedApp(appParam);
    if (!isNew) void loadStream();
  }, [isNew, loadStream, searchParams]);

  /** Form values → the card as it is saved (and as the translation tab sees it) */
  const toStream = (data: StreamFormData): Stream => {
    const tickets = list(data.tickets);
    const stream: Stream = {
      ...loaded,
      stream: data.stream.trim(),
      name: data.name.trim(),
      goal: data.goal.trim(),
      description: data.description.trim() || undefined,
      lifecycle: data.lifecycle,
      owner: data.owner.trim() || undefined,
      tickets: tickets.length ? tickets : undefined,
      kpis: data.kpis.filter((k) => k.name.trim()).map((k) => ({ id: k.id, name: k.name.trim(), ...(k.target.trim() ? { target: k.target.trim() } : {}) })),
      stages: data.stages.map(fromStageForm),
      i18n,
    };
    if (!stream.kpis?.length) delete stream.kpis;
    return stream;
  };

  const onSubmit = async (data: StreamFormData) => {
    try {
      setSaving(true);
      setError(null);
      const response = await fetch('/api/save-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: toStream(data), appId: selectedApp }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || t('st.saveFailed'));
      }
      router.push(`/streams${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`);
    } catch (e: unknown) {
      console.error('Error saving stream:', e);
      setError((e as Error).message || t('st.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-bg">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <p className="text-muted">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-bg">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="mb-6 flex items-center">
          <h1 className="text-3xl font-bold text-fg">{isNew ? t('st.newTitle') : t('st.editTitle')}</h1>
          <FormHelpHint hintKey="streamDetail" />
        </div>

        {error && <div className="mb-6 p-4 bg-danger-muted border border-danger-border-soft rounded text-danger-fg">{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <LanguageTabs languages={languages} value={language || primary} onChange={setLanguage} />
          {translating && (
            <div className="bg-surface p-6 rounded-lg shadow">
              <TranslationEditor schema={streamSchema} entry={toStream({ ...getValues(), ...watch() })} i18n={i18n} language={language} primary={primary} onChange={(next) => setI18n(next as Stream['i18n'])} />
            </div>
          )}
          <div className={translating ? 'hidden' : 'space-y-6'}>
            <div className="bg-surface p-6 rounded-lg shadow space-y-4">
              <h2 className="text-xl font-semibold text-fg">{t('wf.basic')}</h2>
              <label className="block">
                <span className="block text-sm font-medium text-fg-2 mb-1">{t('st.id')}</span>
                <input {...register('stream', { required: t('st.idRequired') })} disabled={!isNew} placeholder="context.stream_name" className={input} />
                {errors.stream && <p className="mt-1 text-sm text-danger">{errors.stream.message}</p>}
                <p className="mt-1 text-sm text-meta">{t('st.idFormat')}</p>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-fg-2 mb-1">{t('common.name')}</span>
                <input {...register('name', { required: true })} placeholder={t('st.namePlaceholder')} className={input} />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-fg-2 mb-1">{t('st.goal')}</span>
                <textarea {...register('goal', { required: true })} rows={2} placeholder={t('st.goalPlaceholder')} className={input} />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-fg-2 mb-1">{t('common.description')}</span>
                <textarea {...register('description')} rows={2} placeholder={t('st.descriptionPlaceholder')} className={input} />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-sm font-medium text-fg-2 mb-1">{t('wf.lifecycle')}</span>
                  <select {...register('lifecycle', { required: true })} className={input}>
                    {LIFECYCLES.map((l) => (
                      <option key={l} value={l}>
                        {t(`lifecycle.${l}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-fg-2 mb-1">{t('st.owner')}</span>
                  <input {...register('owner')} className={input} />
                </label>
                <label className="block">
                  <span className="block text-sm font-medium text-fg-2 mb-1">{t('wf.tickets')}</span>
                  <input {...register('tickets')} placeholder="PRODUCTCREATOR-34, #12" className={input} />
                </label>
              </div>
            </div>

            <div className="bg-surface p-6 rounded-lg shadow">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-fg">{t('st.kpis')}</h2>
                <button type="button" onClick={() => kpis.append({ id: nextId('K', getValues('kpis').map((k) => k.id)), name: '', target: '' })} className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover">
                  {t('st.addKpi')}
                </button>
              </div>
              <div className="space-y-2">
                {kpis.fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
                    <input {...register(`kpis.${index}.id` as const)} readOnly className="w-16 px-2 py-2 border border-border-strong rounded bg-surface-muted text-meta font-mono text-sm" />
                    <input {...register(`kpis.${index}.name` as const)} placeholder={t('st.kpiName')} className={input} />
                    <input {...register(`kpis.${index}.target` as const)} placeholder={t('st.kpiTarget')} className="w-40 px-3 py-2 border border-border-strong rounded bg-surface text-fg" />
                    <button type="button" onClick={() => kpis.remove(index)} className="px-3 py-2 text-danger hover:text-danger-fg-strong">
                      {t('common.remove')}
                    </button>
                  </div>
                ))}
                {kpis.fields.length === 0 && <p className="text-sm text-meta italic">{t('st.noKpis')}</p>}
              </div>
            </div>

            <div className="bg-surface p-6 rounded-lg shadow">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-fg">{t('st.stages')}</h2>
                <button
                  type="button"
                  onClick={() => stages.append({ id: nextId('ST', getValues('stages').map((s) => s.id)), name: '', entry_events: '', exit_events: '', features: [], workflows: [], performed_by: [] })}
                  className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
                >
                  {t('st.addStage')}
                </button>
              </div>
              <div className="space-y-4">
                {stages.fields.map((field, index) => (
                  <StageEditor key={field.key} control={control} index={index} remove={() => stages.remove(index)} features={features} workflows={workflows} performers={performers} />
                ))}
                {stages.fields.length === 0 && <p className="text-sm text-meta italic">{t('st.noStages')}</p>}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-on rounded hover:bg-accent-hover disabled:bg-accent-disabled">
              {saving ? t('common.saving') : t('st.save')}
            </button>
            <button type="button" onClick={() => router.back()} className="px-6 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
