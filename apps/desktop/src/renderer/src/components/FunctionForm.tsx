'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { FunctionCard } from '@pc/core/types';
import * as yaml from 'js-yaml';
import FormHelpHint from './FormHelpHint';

interface FunctionFormProps {
  existingCard?: FunctionCard | null;
  mode: 'new' | 'edit';
}

type FunctionFormData = Omit<FunctionCard, 'tags' | 'emits' | 'consumes' | 'apis'> & {
  tags: { value: string }[];
  emits: { value: string }[];
  consumes: { value: string }[];
  apis: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
  }[];
};

export default function FunctionForm({ existingCard, mode }: FunctionFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedApp, setSelectedApp] = useState<string>('');

  const {
    register,
    handleSubmit,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<FunctionFormData>({
    defaultValues: {
      ...existingCard,
      lifecycle: existingCard?.lifecycle || 'draft',
      tags: (existingCard?.tags || []).map(t => ({ value: t })),
      emits: (existingCard?.emits || []).map(e => ({ value: e })),
      consumes: (existingCard?.consumes || []).map(c => ({ value: c })),
      apis: existingCard?.apis || [],
    } as FunctionFormData,
  });

  const { fields: tagFields, append: appendTag, remove: removeTag } = useFieldArray<FunctionFormData, 'tags'>({
    control,
    name: 'tags',
  });

  const { fields: emitFields, append: appendEmit, remove: removeEmit } = useFieldArray<FunctionFormData, 'emits'>({
    control,
    name: 'emits',
  });

  const { fields: consumeFields, append: appendConsume, remove: removeConsume } = useFieldArray<FunctionFormData, 'consumes'>({
    control,
    name: 'consumes',
  });

  const { fields: apiFields, append: appendApi, remove: removeApi } = useFieldArray<FunctionFormData, 'apis'>({
    control,
    name: 'apis',
  });

  useEffect(() => {
    const appParam = searchParams.get('app');
    if (appParam) {
      setSelectedApp(appParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (existingCard) {
      reset({
        ...existingCard,
        tags: (existingCard.tags || []).map(t => ({ value: t })),
        emits: (existingCard.emits || []).map(e => ({ value: e })),
        consumes: (existingCard.consumes || []).map(c => ({ value: c })),
      });
    }
  }, [existingCard, reset]);

  const formData = watch();
  const isEditMode = mode === 'edit';
  const isFieldsReadOnly = isEditMode;

  const updatePreview = () => {
    try {
      // Generate ID from current form values
      const generatedId = isEditMode
        ? formData.id
        : `${formData.bounded_context || ''}.${formData.entity || ''}.${formData.action || ''}`;

      const data: Partial<FunctionCard> = {
        id: generatedId,
        name: formData.name || '',
        bounded_context: formData.bounded_context || '',
        entity: formData.entity || '',
        action: formData.action || '',
        owner: formData.owner || '',
        lifecycle: formData.lifecycle || 'draft',
        description: formData.description || '',
        tags: (formData.tags || []).map(t => t.value).filter((t) => t && t.trim()),
        emits: (formData.emits || []).map(e => e.value).filter((e) => e && e.trim()),
        consumes: (formData.consumes || []).map(c => c.value).filter((c) => c && c.trim()),
        apis: (formData.apis || []).filter((a) => a.method && a.path && a.path.trim()),
      };

      const yamlStr = yaml.dump(data, { lineWidth: -1 });
      setPreview(yamlStr);
    } catch (err) {
      setPreview(`Error generating YAML: ${err}`);
    }
  };

  const onSubmit = async (data: FunctionFormData) => {
    setSaving(true);
    setError('');

    // Validate app is selected
    if (!selectedApp) {
      setError('Please select an app in the header');
      setSaving(false);
      return;
    }

    try {
      // Generate ID from form data if new
      const generatedId = isEditMode
        ? data.id
        : `${data.bounded_context}.${data.entity}.${data.action}`;

      const payload: FunctionCard = {
        ...data,
        id: generatedId,
        tags: (data.tags || []).map(t => t.value).filter((t) => t && t.trim()),
        emits: (data.emits || []).map(e => e.value).filter((e) => e && e.trim()),
        consumes: (data.consumes || []).map(c => c.value).filter((c) => c && c.trim()),
        apis: (data.apis || []).filter((a) => a.method && a.path && a.path.trim()),
      };

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: payload,
          appId: selectedApp,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        setError(err.error || 'Failed to save');
        setSaving(false);
        return;
      }

      const result = await response.json();
      router.push(`/f/${result.id}`);
    } catch {
      setError('Network error');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center">
          <h1 className="text-2xl font-bold">
            {isEditMode ? `Edit: ${existingCard?.name}` : 'New Function'}
          </h1>
          <FormHelpHint hintKey="functionForm" />
          {isEditMode && existingCard && (
            <p className="text-muted mt-2">{existingCard.id}</p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-danger-soft text-danger-fg-strong rounded">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-8">
          <div className="bg-surface p-6 rounded shadow">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {!isEditMode && !selectedApp && (
                <div className="rounded border border-warn-border-strong bg-warn-soft px-4 py-3 text-sm text-warn-fg">
                  Please select an app from the header to choose where the YAML file will be written.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Bounded Context *</label>
                <input
                  {...register('bounded_context', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg disabled:bg-surface-muted disabled:text-meta"
                  disabled={isFieldsReadOnly}
                />
                {errors.bounded_context && (
                  <p className="text-sm text-danger">Required</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Entity *</label>
                <input
                  {...register('entity', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg disabled:bg-surface-muted disabled:text-meta"
                  disabled={isFieldsReadOnly}
                />
                {errors.entity && <p className="text-sm text-danger">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Action *</label>
                <input
                  {...register('action', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg disabled:bg-surface-muted disabled:text-meta"
                  disabled={isFieldsReadOnly}
                />
                {errors.action && <p className="text-sm text-danger">Required</p>}
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
                <label className="block text-sm font-medium mb-1 text-fg-2">Name *</label>
                <input
                  {...register('name', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                />
                {errors.name && <p className="text-sm text-danger">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Owner *</label>
                <input
                  {...register('owner', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                />
                {errors.owner && <p className="text-sm text-danger">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Lifecycle *</label>
                <select
                  {...register('lifecycle', { required: true })}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="deprecated">Deprecated</option>
                  <option value="removed">Removed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Description</label>
                <textarea
                  {...register('description')}
                  className="w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                  rows={3}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Tags</label>
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
                    + Add Tag
                  </button>
                </div>
              </div>

              {/* Emits Events */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Emits Events</label>
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
                    + Add Event
                  </button>
                </div>
              </div>

              {/* Consumes Events */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">Consumes Events</label>
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
                    + Add Event
                  </button>
                </div>
              </div>

              {/* APIs */}
              <div>
                <label className="block text-sm font-medium mb-1 text-fg-2">APIs</label>
                <div className="space-y-2">
                  {apiFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <select
                        {...register(`apis.${index}.method` as const)}
                        className="px-3 py-2 border border-border-strong rounded bg-surface text-fg"
                      >
                        <option value="">Method</option>
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
                    + Add API
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={updatePreview}
                  className="px-4 py-2 bg-surface-neutral text-on rounded hover:bg-surface-neutral-hover"
                >
                  Preview YAML
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-accent text-on rounded hover:bg-accent-hover disabled:bg-surface-disabled"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-surface p-6 rounded shadow">
            <h2 className="text-lg font-semibold mb-4">YAML Preview</h2>
            <pre className="bg-surface-muted p-4 rounded text-sm overflow-auto max-h-[600px]">
              {preview || 'Click "Preview YAML" to generate'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
