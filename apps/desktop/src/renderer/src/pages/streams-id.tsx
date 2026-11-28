'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { Stream } from '@pc/core/types';
import FormHelpHint from '@/components/FormHelpHint';
import { t } from '@/i18n';

type StreamFormData = {
  stream: string;
  name: string;
  goal: string;
  kpis: { value: string }[];
  stages: {
    name: string;
    entry_events: { value: string }[];
    exit_events: { value: string }[];
    workflows: { value: string }[];
  }[];
  rules: {
    unique_function_per_stage: boolean;
  };
};

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

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StreamFormData>({
    defaultValues: {
      stream: '',
      name: '',
      goal: '',
      kpis: [],
      stages: [],
      rules: {
        unique_function_per_stage: false,
      },
    },
  });

  const {
    fields: kpiFields,
    append: appendKpi,
    remove: removeKpi,
  } = useFieldArray({
    control,
    name: 'kpis',
  });

  const {
    fields: stageFields,
    append: appendStage,
    remove: removeStage,
  } = useFieldArray({
    control,
    name: 'stages',
  });

  const loadStream = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/stream?id=${encodeURIComponent(streamId)}`);

      if (!response.ok) {
        throw new Error(t('st.notFound'));
      }

      const stream: Stream = await response.json();

      reset({
        stream: stream.stream,
        name: stream.name || '',
        goal: stream.goal,
        kpis: (stream.kpis || []).map(kpi => ({ value: kpi })),
        stages: stream.stages.map(stage => ({
          name: stage.name,
          entry_events: stage.entry_events.map(e => ({ value: e })),
          exit_events: stage.exit_events.map(e => ({ value: e })),
          workflows: (stage.workflows || []).map(w => ({ value: w })),
        })),
        rules: {
          unique_function_per_stage: stream.rules?.unique_function_per_stage || false,
        },
      });
    } catch (error) {
      console.error('Error loading stream:', error);
      setError(t('st.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [streamId, reset]);

  useEffect(() => {
    const appParam = searchParams.get('app');
    if (appParam) {
      setSelectedApp(appParam);
    }
    if (!isNew) {
      void loadStream();
    }
  }, [isNew, loadStream, searchParams]);


  const onSubmit = async (data: StreamFormData) => {
    try {
      setSaving(true);
      setError(null);

      const stream: Stream = {
        stream: data.stream,
        name: data.name || undefined,
        goal: data.goal,
        kpis: data.kpis.map(k => k.value).filter(v => v.trim()),
        stages: data.stages.map(stage => ({
          name: stage.name,
          entry_events: stage.entry_events.map(e => e.value).filter(v => v.trim()),
          exit_events: stage.exit_events.map(e => e.value).filter(v => v.trim()),
          workflows: stage.workflows?.map(w => w.value).filter(v => v.trim()),
        })),
        rules: {
          unique_function_per_stage: data.rules.unique_function_per_stage,
        },
      };

      const response = await fetch('/api/save-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream, appId: selectedApp }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || t('st.saveFailed'));
      }

      router.push(`/streams${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`);
    } catch (error: unknown) {
      console.error('Error saving stream:', error);
      setError((error as Error).message || t('st.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-bg">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <p className="text-muted">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-bg">

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="mb-6 flex items-center">
          <h1 className="text-3xl font-bold text-fg">
            {isNew ? t('st.newTitle') : t('st.editTitle')}
          </h1>
          <FormHelpHint hintKey="streamDetail" />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-danger-muted border border-danger-border-soft rounded text-danger-fg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-surface p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-fg mb-4">{t('wf.basic')}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1">
                  {t('st.id')}
                </label>
                <input
                  {...register('stream', { required: t('st.idRequired') })}
                  disabled={!isNew}
                  placeholder={t('st.idPlaceholder')}
                  className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent disabled:bg-surface-muted"
                />
                {errors.stream && (
                  <p className="mt-1 text-sm text-danger">{errors.stream.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1">
                  {t('common.name')}
                </label>
                <input
                  {...register('name')}
                  placeholder={t('wf.namePlaceholder')}
                  className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1">
                  {t('st.goal')}
                </label>
                <textarea
                  {...register('goal', { required: t('st.goalRequired') })}
                  placeholder={t('st.goalPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                />
                {errors.goal && (
                  <p className="mt-1 text-sm text-danger">{errors.goal.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-fg">{t('st.kpis')}</h2>
              <button
                type="button"
                onClick={() => appendKpi({ value: '' })}
                className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
              >
                {t('st.addKpi')}
              </button>
            </div>

            <div className="space-y-2">
              {kpiFields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      {...register(`kpis.${index}.value` as const)}
                      placeholder={t('st.kpiPlaceholder')}
                      className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeKpi(index)}
                    className="px-3 py-2 text-danger hover:text-danger-fg-strong"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}

              {kpiFields.length === 0 && (
                <p className="text-sm text-meta italic">{t('st.noKpis')}</p>
              )}
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-fg">{t('st.stages')}</h2>
              <button
                type="button"
                onClick={() =>
                  appendStage({
                    name: '',
                    entry_events: [],
                    exit_events: [],
                    workflows: [],
                  })
                }
                className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
              >
                {t('st.addStage')}
              </button>
            </div>

            <div className="space-y-4">
              {stageFields.map((stageField, stageIndex) => (
                <StageEditor
                  key={stageField.id}
                  stageIndex={stageIndex}
                  register={register}
                  control={control}
                  removeStage={removeStage}
                />
              ))}

              {stageFields.length === 0 && (
                <p className="text-sm text-meta italic">{t('st.noStages')}</p>
              )}
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-fg mb-4">{t('st.rules')}</h2>

            <div className="flex items-center">
              <input
                {...register('rules.unique_function_per_stage')}
                type="checkbox"
                className="h-4 w-4 text-accent rounded border-border-strong focus:ring-accent"
              />
              <label className="ml-2 text-sm text-fg-2">
                {t('st.uniqueFeature')}
              </label>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-accent text-on rounded hover:bg-accent-hover disabled:bg-accent-disabled"
            >
              {saving ? t('common.saving') : t('st.save')}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StageEditor({
  stageIndex,
  register,
  control,
  removeStage,
}: {
  stageIndex: number;
  register: ReturnType<typeof useForm<StreamFormData>>['register'];
  control: ReturnType<typeof useForm<StreamFormData>>['control'];
  removeStage: (index: number) => void;
}) {
  const {
    fields: entryEventFields,
    append: appendEntryEvent,
    remove: removeEntryEvent,
  } = useFieldArray({
    control,
    name: `stages.${stageIndex}.entry_events` as const,
  });

  const {
    fields: exitEventFields,
    append: appendExitEvent,
    remove: removeExitEvent,
  } = useFieldArray({
    control,
    name: `stages.${stageIndex}.exit_events` as const,
  });

  const {
    fields: workflowFields,
    append: appendWorkflow,
    remove: removeWorkflow,
  } = useFieldArray({
    control,
    name: `stages.${stageIndex}.workflows` as const,
  });

  return (
    <div className="border border-border rounded p-4 bg-bg">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-medium text-fg">{t('st.stage', { n: stageIndex + 1 })}</h3>
        <button
          type="button"
          onClick={() => removeStage(stageIndex)}
          className="text-danger hover:text-danger-fg-strong text-sm"
        >
          {t('st.removeStage')}
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg-2 mb-1">{t('st.stageName')}</label>
          <input
            {...register(`stages.${stageIndex}.name` as const, {
              required: t('st.stageNameRequired'),
            })}
            placeholder={t('st.stageNamePlaceholder')}
            className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent bg-surface"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-fg-2">{t('st.entryEvents')}</label>
            <button
              type="button"
              onClick={() => appendEntryEvent({ value: '' })}
              className="text-sm text-accent hover:text-accent-fg"
            >
              {t('st.add')}
            </button>
          </div>
          <div className="space-y-2">
            {entryEventFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <input
                  {...register(`stages.${stageIndex}.entry_events.${index}.value` as const)}
                  placeholder="event.name"
                  className="flex-1 px-3 py-1.5 text-sm border border-border-strong rounded focus:ring-2 focus:ring-accent bg-surface"
                />
                <button
                  type="button"
                  onClick={() => removeEntryEvent(index)}
                  className="text-danger hover:text-danger-fg-strong text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-fg-2">{t('st.exitEvents')}</label>
            <button
              type="button"
              onClick={() => appendExitEvent({ value: '' })}
              className="text-sm text-accent hover:text-accent-fg"
            >
              {t('st.add')}
            </button>
          </div>
          <div className="space-y-2">
            {exitEventFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <input
                  {...register(`stages.${stageIndex}.exit_events.${index}.value` as const)}
                  placeholder="event.name"
                  className="flex-1 px-3 py-1.5 text-sm border border-border-strong rounded focus:ring-2 focus:ring-accent bg-surface"
                />
                <button
                  type="button"
                  onClick={() => removeExitEvent(index)}
                  className="text-danger hover:text-danger-fg-strong text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-fg-2">{t('st.workflows')}</label>
            <button
              type="button"
              onClick={() => appendWorkflow({ value: '' })}
              className="text-sm text-accent hover:text-accent-fg"
            >
              {t('st.add')}
            </button>
          </div>
          <div className="space-y-2">
            {workflowFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <input
                  {...register(`stages.${stageIndex}.workflows.${index}.value` as const)}
                  placeholder="context.workflow_name"
                  className="flex-1 px-3 py-1.5 text-sm border border-border-strong rounded focus:ring-2 focus:ring-accent bg-surface"
                />
                <button
                  type="button"
                  onClick={() => removeWorkflow(index)}
                  className="text-danger hover:text-danger-fg-strong text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
