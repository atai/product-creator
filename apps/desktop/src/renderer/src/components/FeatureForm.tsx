'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { LIFECYCLES, Feature } from '@pc/core/types';
import * as yaml from 'js-yaml';
import FormHelpHint from './FormHelpHint';
import ValidationIssues, { type Issue } from './ValidationIssues';
import FeatureSpecFields, { specFromForm, specToForm, type FeatureFormData } from './FeatureSpecFields';
import { t } from '@/i18n';
import featureSchema from '@pc/core/schema/feature.schema.json';
import { LanguageTabs, TranslationEditor, useProjectLanguages } from './TranslationEditor';

interface FeatureFormProps {
  existingCard?: Feature | null;
  mode: 'new' | 'edit';
}

const toForm = (card: Feature | null | undefined): FeatureFormData =>
  ({
    ...card,
    lifecycle: card?.lifecycle || 'draft',
    tags: (card?.tags || []).map((t) => ({ value: t })),
    emits: (card?.emits || []).map((e) => ({ value: e })),
    consumes: (card?.consumes || []).map((c) => ({ value: c })),
    apis: card?.apis || [],
    ...specToForm(card),
  }) as FeatureFormData;

/** Form values → the card as it is checked, previewed and saved */
function toPayload(data: FeatureFormData, id: string, i18n: Feature['i18n']): Feature {
  const { tags, emits, consumes, actors: _actors, requirements: _r, acceptance: _a, constraints: _c, decisions: _d, open_questions: _q, tickets: _t, code_refs: _cr, screens: _sc, ...rest } = data;
  const payload: Feature = {
    ...rest,
    id,
    tags: (tags || []).map((t) => t.value).filter((t) => t && t.trim()),
    emits: (emits || []).map((e) => e.value).filter((e) => e && e.trim()),
    consumes: (consumes || []).map((c) => c.value).filter((c) => c && c.trim()),
    apis: (data.apis || []).filter((a) => a.method && a.path && a.path.trim()),
    objects: (data.objects || []).filter((o) => o.id && o.id.trim()).map((o) => ({ id: o.id.trim(), access: o.access || 'read' })),
    ...specFromForm(data),
  };
  if (!payload.objects?.length) delete payload.objects;
  // translations are edited outside react-hook-form (TranslationEditor)
  if (i18n) payload.i18n = i18n;
  else delete payload.i18n;
  return payload;
}

export default function FeatureForm({ existingCard, mode }: FeatureFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [checked, setChecked] = useState(false);
  const [objectIds, setObjectIds] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [i18n, setI18n] = useState<Feature['i18n']>(existingCard?.i18n);
  const [language, setLanguage] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<FeatureFormData>({
    defaultValues: toForm(existingCard),
  });

  const { fields: tagFields, append: appendTag, remove: removeTag } = useFieldArray<FeatureFormData, 'tags'>({
    control,
    name: 'tags',
  });

  const { fields: emitFields, append: appendEmit, remove: removeEmit } = useFieldArray<FeatureFormData, 'emits'>({
    control,
    name: 'emits',
  });

  const { fields: consumeFields, append: appendConsume, remove: removeConsume } = useFieldArray<FeatureFormData, 'consumes'>({
    control,
    name: 'consumes',
  });

  const { fields: apiFields, append: appendApi, remove: removeApi } = useFieldArray<FeatureFormData, 'apis'>({
    control,
    name: 'apis',
  });

  // Business objects the feature reads or writes (PRODUCTCREATOR-29)
  const { fields: objectFields, append: appendObject, remove: removeObject } = useFieldArray<FeatureFormData, 'objects'>({
    control,
    name: 'objects',
  });

  useEffect(() => {
    fetch('/api/business-objects')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; childObjects?: { id: string }[] }[]) =>
        setObjectIds(list.flatMap((o) => [o.id, ...(o.childObjects ?? []).map((c) => c.id)]).sort())
      )
      .catch(() => setObjectIds([]));
  }, []);

  useEffect(() => {
    const appParam = searchParams.get('app');
    if (appParam) {
      setSelectedApp(appParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (existingCard) {
      reset(toForm(existingCard));
      setI18n(existingCard?.i18n);
    }
  }, [existingCard, reset]);

  const formData = watch();
  const isEditMode = mode === 'edit';
  const languages = useProjectLanguages(selectedApp || undefined);
  const primary = languages[0];
  const isFieldsReadOnly = isEditMode;

  const updatePreview = () => {
    try {
      // Generate ID from current form values
      const generatedId = isEditMode
        ? formData.id
        : `${formData.bounded_context || ''}.${formData.entity || ''}.${formData.action || ''}`;

      const data = toPayload(formData, generatedId, i18n);

      const yamlStr = yaml.dump(data, { lineWidth: -1 });
      setPreview(yamlStr);
    } catch (err) {
      setPreview(t('ff.yamlError', { error: String(err) }));
    }
  };

  /** Validate the form against the model without saving (POST /api/validate-plan) */
  const checkPlan = async () => {
    const data = watch();
    const id = isEditMode ? data.id : `${data.bounded_context}.${data.entity}.${data.action}`;
    const proposed = toPayload(data, id, i18n);
    const response = await fetch('/api/validate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [{ kind: 'feature', data: proposed, component: selectedApp || undefined }] }),
    });
    const result = (await response.json()) as { introduced?: Issue[]; error?: string };
    setError(result.error ?? '');
    setIssues(result.introduced ?? []);
    setChecked(true);
  };

  const onSubmit = async (data: FeatureFormData) => {
    setSaving(true);
    setError('');

    // Validate app is selected
    if (!selectedApp) {
      setError(t('ff.selectApp'));
      setSaving(false);
      return;
    }

    try {
      // Generate ID from form data if new
      const generatedId = isEditMode
        ? data.id
        : `${data.bounded_context}.${data.entity}.${data.action}`;

      const payload = toPayload(data, generatedId, i18n);

      const response = await fetch('/api/save-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: payload,
          appId: selectedApp,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        setIssues(Array.isArray(err.issues) ? err.issues : []);
        setError(Array.isArray(err.issues) && err.issues.length ? t('ff.breaksModel') : err.error || t('ff.saveFailed'));
        setSaving(false);
        return;
      }

      const result = await response.json();
      router.push(`/features/${result.id}`);
    } catch {
      setError(t('common.networkError'));
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center">
          <h1 className="text-2xl font-bold">
            {isEditMode ? t('ff.editTitle', { name: existingCard?.name ?? '' }) : t('ff.newTitle')}
          </h1>
          <FormHelpHint hintKey="featureForm" />
          {isEditMode && existingCard && (
            <p className="text-muted mt-2">{existingCard.id}</p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-danger-soft text-danger-fg-strong rounded">{error}</div>
        )}
        {(issues.length > 0 || checked) && (
          <div className="mb-4 p-4 bg-surface rounded shadow">
            {issues.length ? <ValidationIssues issues={issues} app={selectedApp || undefined} /> : <p className="text-sm text-success-fg">{t('ff.consistent')}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-8">
          <div className="bg-surface p-6 rounded shadow">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {!isEditMode && !selectedApp && (
                <div className="rounded border border-warn-border-strong bg-warn-soft px-4 py-3 text-sm text-warn-fg">
                  {t('ff.selectAppHint')}
                </div>
              )}

              <LanguageTabs languages={languages} value={language || primary} onChange={setLanguage} />
              {language && language !== primary && (
                <TranslationEditor
                  schema={featureSchema}
                  entry={toPayload(watch(), existingCard?.id ?? '', i18n)}
                  i18n={i18n}
                  language={language}
                  primary={primary}
                  onChange={(next) => setI18n(next as Feature['i18n'])}
                />
              )}
              <div className={language && language !== primary ? 'hidden' : 'space-y-4'}>
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.boundedContext')}</label>
                <input
                  {...register('bounded_context', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg disabled:bg-surface-muted disabled:text-meta"
                  disabled={isFieldsReadOnly}
                />
                {errors.bounded_context && (
                  <p className="text-sm text-danger">{t('common.required')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.entity')}</label>
                <input
                  {...register('entity', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg disabled:bg-surface-muted disabled:text-meta"
                  disabled={isFieldsReadOnly}
                />
                {errors.entity && <p className="text-sm text-danger">{t('common.required')}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.action')}</label>
                <input
                  {...register('action', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg disabled:bg-surface-muted disabled:text-meta"
                  disabled={isFieldsReadOnly}
                />
                {errors.action && <p className="text-sm text-danger">{t('common.required')}</p>}
              </div>

              {isEditMode && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-fg-2">ID</label>
                  <input
                    {...register('id')}
                    className="w-full px-3 py-2 border border-border-strong rounded bg-surface-muted text-meta"
                    readOnly
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.name')}</label>
                <input
                  {...register('name', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                />
                {errors.name && <p className="text-sm text-danger">{t('common.required')}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.owner')}</label>
                <input
                  {...register('owner', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                />
                {errors.owner && <p className="text-sm text-danger">{t('common.required')}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.lifecycle')}</label>
                <select
                  {...register('lifecycle', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                >
                  {LIFECYCLES.map((l) => (
                    <option key={l} value={l}>
                      {t(`lifecycle.${l}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('common.description')}</label>
                <textarea
                  {...register('description')}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                  rows={3}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.tags')}</label>
                <div className="space-y-2">
                  {tagFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <input
                        {...register(`tags.${index}.value` as const)}
                        className="flex-1 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta"
                        placeholder="tag-name"
                      />
                      <button
                        type="button"
                        onClick={() => removeTag(index)}
                        className="px-3 py-2 bg-danger-fill text-on rounded hover:bg-danger-fill-hover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendTag({ value: '' })}
                    className="px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm"
                  >
                    {t('ff.addTag')}
                  </button>
                </div>
              </div>

              {/* Emits Events */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.emits')}</label>
                <div className="space-y-2">
                  {emitFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <input
                        {...register(`emits.${index}.value` as const)}
                        className="flex-1 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta"
                        placeholder="event.name"
                      />
                      <button
                        type="button"
                        onClick={() => removeEmit(index)}
                        className="px-3 py-2 bg-danger-fill text-on rounded hover:bg-danger-fill-hover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendEmit({ value: '' })}
                    className="px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm"
                  >
                    {t('ff.addEvent')}
                  </button>
                </div>
              </div>

              {/* Consumes Events */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.consumes')}</label>
                <div className="space-y-2">
                  {consumeFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <input
                        {...register(`consumes.${index}.value` as const)}
                        className="flex-1 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta"
                        placeholder="event.name"
                      />
                      <button
                        type="button"
                        onClick={() => removeConsume(index)}
                        className="px-3 py-2 bg-danger-fill text-on rounded hover:bg-danger-fill-hover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendConsume({ value: '' })}
                    className="px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm"
                  >
                    {t('ff.addEvent')}
                  </button>
                </div>
              </div>

              {/* APIs */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.apis')}</label>
                <div className="space-y-2">
                  {apiFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <select
                        {...register(`apis.${index}.method` as const)}
                        className="px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                      >
                        <option value="">{t('ff.method')}</option>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                      <input
                        {...register(`apis.${index}.path` as const)}
                        className="flex-1 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta"
                        placeholder="/api/path"
                      />
                      <button
                        type="button"
                        onClick={() => removeApi(index)}
                        className="px-3 py-2 bg-danger-fill text-on rounded hover:bg-danger-fill-hover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendApi({ method: 'GET', path: '' })}
                    className="px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm"
                  >
                    {t('ff.addApi')}
                  </button>
                </div>
              </div>

              {/* Business objects (PRODUCTCREATOR-29) */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">{t('ff.objects')}</label>
                <datalist id="feature-object-ids">
                  {objectIds.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
                <div className="space-y-2">
                  {objectFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <input
                        {...register(`objects.${index}.id` as const)}
                        list="feature-object-ids"
                        className="flex-1 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta"
                        placeholder={t('ff.objectId')}
                      />
                      <select {...register(`objects.${index}.access` as const)} className="px-3 py-2 border border-border-strong rounded bg-surface text-fg">
                        <option value="read">{t('feature.access.read')}</option>
                        <option value="write">{t('feature.access.write')}</option>
                      </select>
                      <button type="button" onClick={() => removeObject(index)} className="px-3 py-2 bg-danger-fill text-on rounded hover:bg-danger-fill-hover">
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendObject({ id: '', access: 'read' })}
                    className="px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm"
                  >
                    {t('ff.addObject')}
                  </button>
                </div>
              </div>

              <FeatureSpecFields control={control} register={register} />
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => void checkPlan()}
                  className="px-4 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger"
                >
                  {t('common.check')}
                </button>
                <button
                  type="button"
                  onClick={updatePreview}
                  className="px-4 py-2 bg-surface-neutral text-on rounded hover:bg-surface-neutral-hover"
                >
                  {t('ff.previewYaml')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-accent text-on rounded hover:bg-accent-hover disabled:bg-surface-disabled"
                >
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-surface p-6 rounded shadow">
            <h2 className="text-lg font-semibold mb-4">{t('ff.yamlPreview')}</h2>
            <pre className="bg-surface-muted p-4 rounded text-sm overflow-auto max-h-[600px]">
              {preview || t('ff.clickPreview')}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
