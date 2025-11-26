'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { FunctionCard } from '@/lib/types';
import CatalogPageLayout from '@/components/CatalogPageLayout';

export default function Home() {
  const searchParams = useSearchParams();
  const [functions, setFunctions] = useState<FunctionCard[]>([]);
  const [filteredFunctions, setFilteredFunctions] = useState<FunctionCard[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    bounded_context: '',
    owner: '',
    lifecycle: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load functions with root filter from URL
    const rootParam = searchParams.get('root');
    const url = rootParam ? `/api/index?root=${encodeURIComponent(rootParam)}` : '/api/index';

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
  const lifecycles = ['draft', 'active', 'deprecated', 'removed'];

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <CatalogPageLayout
      title="Functions"
      description="Каталог бизнес-функций: ищите по имени, тегам и API, фильтруйте по контексту, владельцу и статусу, чтобы быстро найти нужный сценарий."
      hintKey="home"
      actions={
        <Link
          href="/new"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium whitespace-nowrap"
        >
          New Function
        </Link>
      }
      search={
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search functions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-500"
          />

          <div className="flex flex-wrap gap-4">
            <select
              value={filters.bounded_context}
              onChange={(e) => setFilters({ ...filters, bounded_context: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded bg-white text-gray-900"
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
              className="px-4 py-2 border border-gray-300 rounded bg-white text-gray-900"
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
              className="px-4 py-2 border border-gray-300 rounded bg-white text-gray-900"
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
      <div className="bg-white rounded shadow">
        {filteredFunctions.length === 0 ? (
          <p className="p-8 text-gray-600">No functions found</p>
        ) : (
          <div className="divide-y">
            {filteredFunctions.map((func) => (
              <Link
                key={func.id}
                href={`/f/${func.id}`}
                className="block p-4 hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{func.name}</h3>
                    <p className="text-sm text-gray-600">{func.id}</p>
                    <p className="text-sm text-gray-500 mt-1">{func.description}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      func.lifecycle === 'active'
                        ? 'bg-green-100 text-green-800'
                        : func.lifecycle === 'draft'
                        ? 'bg-yellow-100 text-yellow-800'
                        : func.lifecycle === 'deprecated'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {func.lifecycle}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </CatalogPageLayout>
  );
}
