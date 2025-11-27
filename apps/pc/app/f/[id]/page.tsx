'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { FunctionCard } from '@/lib/types';
import FunctionForm from '@/components/FunctionForm';
import Link from 'next/link';
import FormHelpHint from '@/components/FormHelpHint';

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

  if (error && !functionCard) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-red-600">{error}</p>
        <Link href="/" className="text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>
    );
  }

  if (!functionCard) {
    return null;
  }

  return (
    <>
      {editMode ? (
        <FunctionForm mode="edit" existingCard={functionCard} />
      ) : (
        <div className="min-h-screen p-8">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8 flex justify-between items-center">
              <div>
                <div className="flex items-center">
                  <h1 className="text-2xl font-bold">{functionCard.name}</h1>
                  <FormHelpHint hintKey="functionDetail" />
                </div>
                <p className="text-gray-600 mt-1">{functionCard.id}</p>
              </div>
              <button
                onClick={() => setEditMode(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Edit
              </button>
            </div>

            <div className="bg-white p-6 rounded shadow">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Bounded Context</h3>
                  <p>{functionCard.bounded_context}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Entity</h3>
                  <p>{functionCard.entity}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Action</h3>
                  <p>{functionCard.action}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Owner</h3>
                  <p>{functionCard.owner}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Lifecycle</h3>
                  <span
                    className={`inline-block px-2 py-1 text-xs rounded ${
                      functionCard.lifecycle === 'active'
                        ? 'bg-green-100 text-green-800'
                        : functionCard.lifecycle === 'draft'
                        ? 'bg-yellow-100 text-yellow-800'
                        : functionCard.lifecycle === 'deprecated'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {functionCard.lifecycle}
                  </span>
                </div>
              </div>

              {functionCard.description && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                  <p className="text-gray-700">{functionCard.description}</p>
                </div>
              )}

              {functionCard.tags && functionCard.tags.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Tags</h3>
                  <div className="flex gap-2">
                    {functionCard.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-1 bg-gray-100 text-sm rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {functionCard.emits && functionCard.emits.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Emits Events</h3>
                  <ul className="list-disc list-inside">
                    {functionCard.emits.map((event, i) => (
                      <li key={i}>{event}</li>
                    ))}
                  </ul>
                </div>
              )}

              {functionCard.consumes && functionCard.consumes.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Consumes Events</h3>
                  <ul className="list-disc list-inside">
                    {functionCard.consumes.map((event, i) => (
                      <li key={i}>{event}</li>
                    ))}
                  </ul>
                </div>
              )}

              {functionCard.apis && functionCard.apis.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">APIs</h3>
                  <div className="space-y-2">
                    {functionCard.apis.map((api, i) => (
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
          </div>
        </div>
      )}
    </>
  );
}
