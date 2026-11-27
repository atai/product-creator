'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Feature } from '@pc/core/types';
import FeatureForm from '@/components/FeatureForm';
import Link from 'next/link';
import FormHelpHint from '@/components/FormHelpHint';
import ImpactPanel from '@/components/ImpactPanel';

export default function FeatureDetail() {
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [feature, setFeature] = useState<Feature | null>(null);

  useEffect(() => {
    fetch(`/api/feature?id=${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setFeature(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Feature not found');
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-full p-8">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (error && !feature) {
    return (
      <div className="min-h-full p-8">
        <p className="text-danger">{error}</p>
        <Link href="/" className="text-accent hover:underline">
          ← Back to list
        </Link>
      </div>
    );
  }

  if (!feature) {
    return null;
  }

  return (
    <>
      {editMode ? (
        <FeatureForm mode="edit" existingCard={feature} />
      ) : (
        <div className="min-h-full p-8">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8 flex justify-between items-center">
              <div>
                <div className="flex items-center">
                  <h1 className="text-2xl font-bold">{feature.name}</h1>
                  <FormHelpHint hintKey="functionDetail" />
                </div>
                <p className="text-muted mt-1">{feature.id}</p>
              </div>
              <button
                onClick={() => setEditMode(true)}
                className="px-4 py-2 bg-accent text-on rounded hover:bg-accent-hover"
              >
                Edit
              </button>
            </div>

            <div className="bg-surface p-6 rounded shadow">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-meta">Bounded Context</h3>
                  <p>{feature.bounded_context}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-meta">Entity</h3>
                  <p>{feature.entity}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-meta">Action</h3>
                  <p>{feature.action}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-meta">Owner</h3>
                  <p>{feature.owner}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-meta">Lifecycle</h3>
                  <span
                    className={`inline-block px-2 py-1 text-xs rounded ${
                      feature.lifecycle === 'active'
                        ? 'bg-success-muted text-success-fg'
                        : feature.lifecycle === 'draft'
                        ? 'bg-warn-muted text-warn-fg'
                        : feature.lifecycle === 'deprecated'
                        ? 'bg-secondary-soft text-secondary-soft-fg'
                        : 'bg-surface-muted text-fg'
                    }`}
                  >
                    {feature.lifecycle}
                  </span>
                </div>
              </div>

              {feature.description && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-meta mb-2">Description</h3>
                  <p className="text-fg-2">{feature.description}</p>
                </div>
              )}

              {feature.tags && feature.tags.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-meta mb-2">Tags</h3>
                  <div className="flex gap-2">
                    {feature.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-1 bg-surface-muted text-sm rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {feature.emits && feature.emits.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-meta mb-2">Emits Events</h3>
                  <ul className="list-disc list-inside">
                    {feature.emits.map((event, i) => (
                      <li key={i}>{event}</li>
                    ))}
                  </ul>
                </div>
              )}

              {feature.consumes && feature.consumes.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-meta mb-2">Consumes Events</h3>
                  <ul className="list-disc list-inside">
                    {feature.consumes.map((event, i) => (
                      <li key={i}>{event}</li>
                    ))}
                  </ul>
                </div>
              )}

              {feature.source_file && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-meta mb-2">Implemented in</h3>
                  <p className="font-mono text-sm">{feature.source_file}</p>
                </div>
              )}

              {feature.objects && feature.objects.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-meta mb-2">Business objects</h3>
                  <ul className="space-y-1 text-sm">
                    {feature.objects.map((o) => (
                      <li key={o.id}>
                        <span className="font-mono">{o.id}</span> <span className="text-xs text-meta">{o.access}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feature.apis && feature.apis.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-meta mb-2">APIs</h3>
                  <div className="space-y-2">
                    {feature.apis.map((api, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <span className="px-2 py-1 bg-accent-muted text-accent-fg text-xs font-mono rounded">
                          {api.method}
                        </span>
                        <span className="font-mono text-sm">{api.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <ImpactPanel kind="feature" id={feature.id} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
