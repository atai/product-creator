'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { LIFECYCLES, Feature } from '@pc/core/types';
import CatalogPageLayout from '@/components/CatalogPageLayout';
import LifecycleBadge from '../components/LifecycleBadge';

export default function FeaturesPage() {
  const searchParams = useSearchParams();
  const [functions, setFunctions] = useState<Feature[]>([]);
  const [filteredFunctions, setFilteredFunctions] = useState<Feature[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    bounded_context: '',
    owner: '',
    lifecycle: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load functions with app filter from URL
    const appParam = searchParams.get('app');
    const url = appParam ? `/api/features?app=${encodeURIComponent(appParam)}` : '/api/features';

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setFunctions(data);
        setFilteredFunctions(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load functions', err);
        setLoading(false);
      });
  }, [searchParams]);

  useEffect(() => {
    let result = functions;

    // Apply facet filters
    if (filters.bounded_context) {
      result = result.filter((f) => f.bounded_context === filters.bounded_context);
    }
    if (filters.owner) {
      result = result.filter((f) => f.owner === filters.owner);
    }
    if (filters.lifecycle) {
      result = result.filter((f) => f.lifecycle === filters.lifecycle);
    }

    // Apply search
    if (search) {
      const fuse = new Fuse(result, {
        keys: ['id', 'name', 'tags', 'apis.path'],
        threshold: 0.3,
      });
      result = fuse.search(search).map((r) => r.item);
    }

    setFilteredFunctions(result);
  }, [search, filters, functions]);

  const uniqueContexts = Array.from(new Set(functions.map((f) => f.bounded_context)));
  const uniqueOwners = Array.from(new Set(functions.map((f) => f.owner)));
  const lifecycles = LIFECYCLES;

  if (loading) {
    return (
      <div className="min-h-full p-8">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <CatalogPageLayout
      title="Features"
      description="Каталог фич (бизнес-возможностей): ищите по имени, тегам и API, фильтруйте по контексту, владельцу и статусу, чтобы быстро найти нужный сценарий."
      hintKey="home"
      actions={
        <Link
          href="/features/new"
          className="px-4 py-2 bg-accent text-on rounded hover:bg-accent-hover text-sm font-medium whitespace-nowrap"
        >
          New Feature
        </Link>
      }
      search={
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search functions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta"
          />

          <div className="flex flex-wrap gap-4">
            <select
              value={filters.bounded_context}
              onChange={(e) => setFilters({ ...filters, bounded_context: e.target.value })}
              className="px-4 py-2 border border-border-strong rounded bg-surface text-fg"
            >
              <option value="">All Contexts</option>
              {uniqueContexts.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
              className="px-4 py-2 border border-border-strong rounded bg-surface text-fg"
            >
              <option value="">All Owners</option>
              {uniqueOwners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>

            <select
              value={filters.lifecycle}
              onChange={(e) => setFilters({ ...filters, lifecycle: e.target.value })}
              className="px-4 py-2 border border-border-strong rounded bg-surface text-fg"
            >
              <option value="">All Lifecycles</option>
              {lifecycles.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
    >
      <div className="bg-surface rounded shadow">
        {filteredFunctions.length === 0 ? (
          <p className="p-8 text-muted">No functions found</p>
        ) : (
          <div className="divide-y">
            {filteredFunctions.map((func) => (
              <Link
                key={func.id}
                href={`/features/${func.id}`}
                className="block p-4 hover:bg-bg"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{func.name}</h3>
                    <p className="text-sm text-muted">{func.id}</p>
                    <p className="text-sm text-meta mt-1">{func.description}</p>
                  </div>
                  <LifecycleBadge lifecycle={func.lifecycle} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </CatalogPageLayout>
  );
}

