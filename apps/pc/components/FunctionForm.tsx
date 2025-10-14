'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { FunctionCard } from '@/lib/types';
import * as yaml from 'js-yaml';
import Link from 'next/link';

interface FunctionFormProps {
  existingCard?: FunctionCard | null;
  mode: 'new' | 'edit';
}

interface RootInfo {
  path: string;
  label: string;
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
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [roots, setRoots] = useState<RootInfo[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<string>('');

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
    // Load available roots
    fetch('/api/roots')
      .then((res) => res.json())
      .then((data) => {
        const rootList = data.roots || [];
        setRoots(rootList);

        if (existingCard) {
          // For edit mode, get root from existing card
          fetch(`/api/card-root?id=${existingCard.id}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.root) {
                setSelectedRoot(data.root);
              } else if (rootList.length > 0) {
                setSelectedRoot(rootList[0].path);
              }
            })
            .catch(() => {
              // Fallback to first root on error
              if (rootList.length > 0) {
                setSelectedRoot(rootList[0].path);
              }
            });
        } else {
          // Set first root as default for new cards
          if (rootList.length > 0) {
            setSelectedRoot(rootList[0].path);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load roots', err);
      });
  }, [existingCard]);

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

    // Validate root is selected
    if (!selectedRoot) {
      setError('Please select a target directory');
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
          targetRoot: selectedRoot,
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
    } catch (err) {
      setError('Network error');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">
            {isEditMode ? `Edit: ${existingCard?.name}` : 'New Function'}
          </h1>
          {isEditMode && existingCard && (
            <p className="text-gray-600 mt-2">{existingCard.id}</p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-800 rounded">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded shadow">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {!isEditMode && roots.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Target Directory *</label>
                  <select
                    value={selectedRoot}
                    onChange={(e) => setSelectedRoot(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-900"
                    required
                  >
                    <option value="">Select Directory</option>
                    {roots.map((root) => (
                      <option key={root.path} value={root.path}>
                        {root.label}
                      </option>
                    ))}
                  </select>
                  {!selectedRoot && (
                    <p className="text-sm text-gray-500 mt-1">Choose where to save this function</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Bounded Context *</label>
                <input
                  {...register('bounded_context', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={isFieldsReadOnly}
                />
                {errors.bounded_context && (
                  <p className="text-sm text-red-600">Required</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Entity *</label>
                <input
                  {...register('entity', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={isFieldsReadOnly}
                />
                {errors.entity && <p className="text-sm text-red-600">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Action *</label>
                <input
                  {...register('action', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                  disabled={isFieldsReadOnly}
                />
                {errors.action && <p className="text-sm text-red-600">Required</p>}
              </div>

              {isEditMode && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">ID</label>
                  <input
                    {...register('id')}
                    className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100 text-gray-500"
                    readOnly
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Name *</label>
                <input
                  {...register('name', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-900"
                />
                {errors.name && <p className="text-sm text-red-600">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Owner *</label>
                <input
                  {...register('owner', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-900"
                />
                {errors.owner && <p className="text-sm text-red-600">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Lifecycle *</label>
                <select
                  {...register('lifecycle', { required: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-900"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="deprecated">Deprecated</option>
                  <option value="removed">Removed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Description</label>
                <textarea
                  {...register('description')}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-900"
                  rows={3}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Tags</label>
                <div className="space-y-2">
                  {tagFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <input
                        {...register(`tags.${index}.value` as const)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500"
                        placeholder="tag-name"
                      />
                      <button
                        type="button"
                        onClick={() => removeTag(index)}
                        className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendTag({ value: '' })}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  >
                    + Add Tag
                  </button>
                </div>
              </div>

              {/* Emits Events */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Emits Events</label>
                <div className="space-y-2">
                  {emitFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <input
                        {...register(`emits.${index}.value` as const)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500"
                        placeholder="event.name"
                      />
                      <button
                        type="button"
                        onClick={() => removeEmit(index)}
                        className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendEmit({ value: '' })}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  >
                    + Add Event
                  </button>
                </div>
              </div>

              {/* Consumes Events */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Consumes Events</label>
                <div className="space-y-2">
                  {consumeFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <input
                        {...register(`consumes.${index}.value` as const)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500"
                        placeholder="event.name"
                      />
                      <button
                        type="button"
                        onClick={() => removeConsume(index)}
                        className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendConsume({ value: '' })}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  >
                    + Add Event
                  </button>
                </div>
              </div>

              {/* APIs */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">APIs</label>
                <div className="space-y-2">
                  {apiFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <select
                        {...register(`apis.${index}.method` as const)}
                        className="px-3 py-2 border border-gray-300 rounded bg-white text-gray-900"
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500"
                        placeholder="/api/path"
                      />
                      <button
                        type="button"
                        onClick={() => removeApi(index)}
                        className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => appendApi({ method: 'GET', path: '' })}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  >
                    + Add API
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={updatePreview}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Preview YAML
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold mb-4">YAML Preview</h2>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-[600px]">
              {preview || 'Click "Preview YAML" to generate'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
