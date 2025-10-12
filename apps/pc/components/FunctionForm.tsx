'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { FunctionCard } from '@/lib/types';
import * as yaml from 'js-yaml';
import Link from 'next/link';

interface FunctionFormProps {
  existingCard?: FunctionCard | null;
  mode: 'new' | 'edit';
}

export default function FunctionForm({ existingCard, mode }: FunctionFormProps) {
  const router = useRouter();
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FunctionCard>({
    defaultValues: existingCard || {
      lifecycle: 'draft',
      tags: [],
      emits: [],
      consumes: [],
      apis: [],
    },
  });

  useEffect(() => {
    if (existingCard) {
      reset(existingCard);
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
        tags: formData.tags || [],
        emits: formData.emits || [],
        consumes: formData.consumes || [],
        apis: formData.apis || [],
      };

      const yamlStr = yaml.dump(data, { lineWidth: -1 });
      setPreview(yamlStr);
    } catch (err) {
      setPreview(`Error generating YAML: ${err}`);
    }
  };

  const onSubmit = async (data: FunctionCard) => {
    setSaving(true);
    setError('');

    try {
      // Generate ID from form data if new
      const generatedId = isEditMode
        ? data.id
        : `${data.bounded_context}.${data.entity}.${data.action}`;

      const payload: FunctionCard = {
        ...data,
        id: generatedId,
        tags: data.tags || [],
        emits: data.emits || [],
        consumes: data.consumes || [],
        apis: data.apis || [],
      };

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back to list
          </Link>
          <h1 className="text-3xl font-bold mt-4">
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
              <div>
                <label className="block text-sm font-medium mb-1">Bounded Context *</label>
                <input
                  {...register('bounded_context', { required: true })}
                  className="w-full px-3 py-2 border rounded disabled:bg-gray-100"
                  disabled={isFieldsReadOnly}
                />
                {errors.bounded_context && (
                  <p className="text-sm text-red-600">Required</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Entity *</label>
                <input
                  {...register('entity', { required: true })}
                  className="w-full px-3 py-2 border rounded disabled:bg-gray-100"
                  disabled={isFieldsReadOnly}
                />
                {errors.entity && <p className="text-sm text-red-600">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Action *</label>
                <input
                  {...register('action', { required: true })}
                  className="w-full px-3 py-2 border rounded disabled:bg-gray-100"
                  disabled={isFieldsReadOnly}
                />
                {errors.action && <p className="text-sm text-red-600">Required</p>}
              </div>

              {isEditMode && (
                <div>
                  <label className="block text-sm font-medium mb-1">ID</label>
                  <input
                    {...register('id')}
                    className="w-full px-3 py-2 border rounded bg-gray-100"
                    readOnly
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  {...register('name', { required: true })}
                  className="w-full px-3 py-2 border rounded"
                />
                {errors.name && <p className="text-sm text-red-600">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Owner *</label>
                <input
                  {...register('owner', { required: true })}
                  className="w-full px-3 py-2 border rounded"
                />
                {errors.owner && <p className="text-sm text-red-600">Required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Lifecycle *</label>
                <select
                  {...register('lifecycle', { required: true })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="deprecated">Deprecated</option>
                  <option value="removed">Removed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  {...register('description')}
                  className="w-full px-3 py-2 border rounded"
                  rows={3}
                />
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
