'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { FunctionCard } from '@/lib/types';
import FunctionForm from '@/components/FunctionForm';
import Link from 'next/link';

export default function FunctionDetail() {
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [functionCard, setFunctionCard] = useState<FunctionCard | null>(null);

  useEffect(() => {
    fetch(`/api/card?id=${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setFunctionCard(data);
        setLoading(false);
      })
      .catch((err) => {
        setError('Function not found');
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error && !formData.id) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-red-600">{error}</p>
        <Link href="/" className="text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <Link href="/" className="text-blue-600 hover:underline">
              ← Back to list
            </Link>
            <h1 className="text-3xl font-bold mt-4">{formData.name}</h1>
            <p className="text-gray-600">{formData.id}</p>
          </div>
          <button
            onClick={() => setEditMode(!editMode)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {editMode ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-800 rounded">{error}</div>
        )}

        {editMode ? (
          <div className="grid grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded shadow">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    {...register('name', { required: true })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Owner *</label>
                  <input
                    {...register('owner', { required: true })}
                    className="w-full px-3 py-2 border rounded"
                  />
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
        ) : (
          <div className="bg-white p-6 rounded shadow">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Bounded Context</h3>
                <p>{formData.bounded_context}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Entity</h3>
                <p>{formData.entity}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Action</h3>
                <p>{formData.action}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Owner</h3>
                <p>{formData.owner}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Lifecycle</h3>
                <span
                  className={`inline-block px-2 py-1 text-xs rounded ${
                    formData.lifecycle === 'active'
                      ? 'bg-green-100 text-green-800'
                      : formData.lifecycle === 'draft'
                      ? 'bg-yellow-100 text-yellow-800'
                      : formData.lifecycle === 'deprecated'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {formData.lifecycle}
                </span>
              </div>
            </div>

            {formData.description && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                <p className="text-gray-700">{formData.description}</p>
              </div>
            )}

            {formData.tags && formData.tags.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Tags</h3>
                <div className="flex gap-2">
                  {formData.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 text-sm rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {formData.emits && formData.emits.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Emits Events</h3>
                <ul className="list-disc list-inside">
                  {formData.emits.map((event, i) => (
                    <li key={i}>{event}</li>
                  ))}
                </ul>
              </div>
            )}

            {formData.consumes && formData.consumes.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Consumes Events</h3>
                <ul className="list-disc list-inside">
                  {formData.consumes.map((event, i) => (
                    <li key={i}>{event}</li>
                  ))}
                </ul>
              </div>
            )}

            {formData.apis && formData.apis.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">APIs</h3>
                <div className="space-y-2">
                  {formData.apis.map((api, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-mono rounded">
                        {api.method}
                      </span>
                      <span className="font-mono text-sm">{api.path}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
