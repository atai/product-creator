'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { LIFECYCLES, type Lifecycle, type Workflow } from '@pc/core/types';
import FormHelpHint from '@/components/FormHelpHint';
import { t } from '@/i18n';
import workflowSchema from '@pc/core/schema/workflow.schema.json';
import { LanguageTabs, TranslationEditor, useProjectLanguages } from '@/components/TranslationEditor';

type WorkflowFormData = {
  workflow: string;
  name: string;
  description: string;
  lifecycle: Lifecycle;
  /** comma-separated issue keys */
  tickets: string;
  steps: { value: string }[];
  emits: { value: string }[];
  compensations: { stepId: string; compensationId: string }[];
};

export default function WorkflowEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflowId = params.id as string;
  const isNew = workflowId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string>('');
  /** The card as loaded: fields the form does not edit are saved back unchanged */
  const [loaded, setLoaded] = useState<Workflow | null>(null);
  // translations of name/description (PRODUCTCREATOR-37), edited outside react-hook-form
  const [i18n, setI18n] = useState<Workflow['i18n']>(undefined);
  const [language, setLanguage] = useState('');
  const languages = useProjectLanguages(selectedApp || undefined);
  const primary = languages[0];
  const translating = Boolean(language && language !== primary);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<WorkflowFormData>({
    defaultValues: {
      workflow: '',
      name: '',
      description: '',
      lifecycle: 'draft',
      tickets: '',
      steps: [],
      emits: [],
      compensations: [],
    },
  });

  const {
    fields: stepFields,
    append: appendStep,
    remove: removeStep,
  } = useFieldArray({
    control,
    name: 'steps',
  });

  const {
    fields: emitFields,
    append: appendEmit,
    remove: removeEmit,
  } = useFieldArray({
    control,
    name: 'emits',
  });

  const {
    fields: compensationFields,
    append: appendCompensation,
    remove: removeCompensation,
  } = useFieldArray({
    control,
    name: 'compensations',
  });

  const loadWorkflow = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workflow?id=${encodeURIComponent(workflowId)}`);

      if (!response.ok) {
        throw new Error(t('wf.notFound'));
      }

      const workflow: Workflow = await response.json();

      setLoaded(workflow);
      setI18n(workflow.i18n);
      reset({
        workflow: workflow.workflow,
        name: workflow.name || '',
        description: workflow.description || '',
        lifecycle: workflow.lifecycle || 'draft',
        tickets: (workflow.tickets || []).join(', '),
        steps: workflow.steps.map(step => ({ value: step })),
        emits: (workflow.emits || []).map(emit => ({ value: emit })),
        compensations: Object.entries(workflow.compensations || {}).map(([stepId, compensationId]) => ({
          stepId,
          compensationId,
        })),
      });
    } catch (error) {
      console.error('Error loading workflow:', error);
      setError(t('wf.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [workflowId, reset]);

  useEffect(() => {
    const appParam = searchParams.get('app');
    if (appParam) {
      setSelectedApp(appParam);
    }
    if (!isNew) {
      void loadWorkflow();
    }
  }, [isNew, loadWorkflow, searchParams]);


  const onSubmit = async (data: WorkflowFormData) => {
    try {
      setSaving(true);
      setError(null);

      const tickets = data.tickets.split(/[\s,]+/).filter(Boolean);
      const workflow: Workflow = {
        ...loaded,
        i18n,
        workflow: data.workflow,
        name: data.name || undefined,
        description: data.description.trim() || undefined,
        lifecycle: data.lifecycle,
        tickets: tickets.length ? tickets : undefined,
        steps: data.steps.map(s => s.value).filter(v => v.trim()),
        emits: data.emits.map(e => e.value).filter(v => v.trim()),
        compensations: data.compensations.reduce((acc, { stepId, compensationId }) => {
          if (stepId.trim() && compensationId.trim()) {
            acc[stepId] = compensationId;
          }
          return acc;
        }, {} as Record<string, string>),
      };

      const response = await fetch('/api/save-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow, appId: selectedApp }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || t('wf.saveFailed'));
      }

      router.push(`/workflows${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`);
    } catch (error: unknown) {
      console.error('Error saving workflow:', error);
      setError((error as Error).message || t('wf.saveFailed'));
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
          <h1 className="text-3xl font-bold text-fg">
            {isNew ? t('wf.newTitle') : t('wf.editTitle')}
          </h1>
          <FormHelpHint hintKey="workflowDetail" />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-danger-muted border border-danger-border-soft rounded text-danger-fg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <LanguageTabs languages={languages} value={language || primary} onChange={setLanguage} />
          {translating && (
            <div className="bg-surface p-6 rounded-lg shadow">
              <TranslationEditor schema={workflowSchema} entry={{ ...loaded, name: watch('name'), description: watch('description') }} i18n={i18n} language={language} primary={primary} onChange={(next) => setI18n(next as Workflow['i18n'])} />
            </div>
          )}
          <div className={translating ? 'hidden' : 'space-y-6'}>
          <div className="bg-surface p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-fg mb-4">{t('wf.basic')}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1">
                  {t('wf.id')}
                </label>
                <input
                  {...register('workflow', { required: t('wf.idRequired') })}
                  disabled={!isNew}
                  placeholder="context.workflow_name"
                  className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent disabled:bg-surface-muted"
                />
                {errors.workflow && (
                  <p className="mt-1 text-sm text-danger">{errors.workflow.message}</p>
                )}
                <p className="mt-1 text-sm text-meta">{t('wf.idFormat')}</p>
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
                <label className="block text-sm font-medium text-fg-2 mb-1">{t('wf.lifecycle')}</label>
                <select {...register('lifecycle', { required: true })} className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg">
                  {LIFECYCLES.map((l) => (
                    <option key={l} value={l}>
                      {t(`lifecycle.${l}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1">{t('common.description')}</label>
                <textarea {...register('description')} rows={2} placeholder={t('wf.descriptionPlaceholder')} className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent" />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1">{t('wf.tickets')}</label>
                <input {...register('tickets')} placeholder="PRODUCTCREATOR-34, #12" className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent" />
              </div>
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-fg">{t('wf.steps')}</h2>
              <button
                type="button"
                onClick={() => appendStep({ value: '' })}
                className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
              >
                {t('wf.addStep')}
              </button>
            </div>

            <div className="space-y-2">
              {stepFields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      {...register(`steps.${index}.value` as const, {
                        required: t('wf.stepRequired'),
                      })}
                      placeholder={t('wf.stepPlaceholder')}
                      className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    className="px-3 py-2 text-danger hover:text-danger-fg-strong"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}

              {stepFields.length === 0 && (
                <p className="text-sm text-meta italic">{t('wf.noSteps')}</p>
              )}
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-fg">{t('wf.events')}</h2>
              <button
                type="button"
                onClick={() => appendEmit({ value: '' })}
                className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
              >
                {t('wf.addEvent')}
              </button>
            </div>

            <div className="space-y-2">
              {emitFields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      {...register(`emits.${index}.value` as const)}
                      placeholder={t('wf.eventPlaceholder')}
                      className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEmit(index)}
                    className="px-3 py-2 text-danger hover:text-danger-fg-strong"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}

              {emitFields.length === 0 && (
                <p className="text-sm text-meta italic">{t('wf.noEvents')}</p>
              )}
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-fg">{t('wf.compensations')}</h2>
              <button
                type="button"
                onClick={() => appendCompensation({ stepId: '', compensationId: '' })}
                className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
              >
                {t('wf.addCompensation')}
              </button>
            </div>

            <div className="space-y-3">
              {compensationFields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <input
                        {...register(`compensations.${index}.stepId` as const)}
                        placeholder={t('wf.stepFeature')}
                        className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <input
                        {...register(`compensations.${index}.compensationId` as const)}
                        placeholder={t('wf.compensationFeature')}
                        className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCompensation(index)}
                    className="px-3 py-2 text-danger hover:text-danger-fg-strong"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}

              {compensationFields.length === 0 && (
                <p className="text-sm text-meta italic">{t('wf.noCompensations')}</p>
              )}
            </div>
            <p className="mt-2 text-sm text-meta">
              {t('wf.compensationsLead')}
            </p>
          </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-accent text-on rounded hover:bg-accent-hover disabled:bg-accent-disabled"
            >
              {saving ? t('common.saving') : t('wf.save')}
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
