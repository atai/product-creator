'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { BusinessObject } from '@pc/core/types';
import CatalogPageLayout from '@/components/CatalogPageLayout';

export default function BusinessObjectsPage() {
  const searchParams = useSearchParams();
  const selectedApp = searchParams.get('app') || '';
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedChildren, setExpandedChildren] = useState<Record<string, boolean>>({});
  const [businessObjects, setBusinessObjects] = useState<BusinessObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadObjects = async () => {
      try {
        setLoading(true);
        const endpoint = selectedApp
          ? `/api/business-objects?app=${encodeURIComponent(selectedApp)}&hierarchical=true`
          : '/api/business-objects?hierarchical=true';
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          setBusinessObjects(data);
        }
      } catch (error) {
        console.error('Failed to load business objects', error);
      } finally {
        setLoading(false);
      }
    };

    loadObjects();
  }, [selectedApp]);

  // Filter items based on search query, including child objects in search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return businessObjects;
    }

    const query = searchQuery.toLowerCase();
    return businessObjects.filter((bo) => {
      // Search in parent object
      const parentMatches =
        bo.id.toLowerCase().includes(query) ||
        bo.name.toLowerCase().includes(query) ||
        bo.owner.toLowerCase().includes(query) ||
        bo.lifecycle.toLowerCase().includes(query) ||
        (bo.description || '').toLowerCase().includes(query) ||
        bo.fields.some((f) => f.name.toLowerCase().includes(query)) ||
        (bo.tables || []).some((t) => t.name.toLowerCase().includes(query));

      // Search in child objects
      const childMatches = bo.childObjects?.some(
        (child) =>
          child.id.toLowerCase().includes(query) ||
          child.name.toLowerCase().includes(query) ||
          (child.description || '').toLowerCase().includes(query) ||
          child.fields.some((f) => f.name.toLowerCase().includes(query))
      );

      return parentMatches || childMatches;
    });
  }, [businessObjects, searchQuery]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleChildExpanded = (parentId: string, childId: string) => {
    const key = `${parentId}:${childId}`;
    setExpandedChildren((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <CatalogPageLayout
      title="Business Objects"
      description="Доменные сущности с полями, таблицами и описаниями. Используйте поиск, чтобы быстро найти нужный объект."
      hintKey="businessObjects"
      actions={
        <div className="flex flex-col gap-2 text-right">
          <div className="text-sm text-meta">
            {selectedApp ? `App: ${selectedApp}` : 'All apps'}
          </div>
          <a
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-on text-sm font-medium rounded-md hover:bg-accent-hover"
            href={`/business-objects/new${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`}
          >
            New Object
          </a>
        </div>
      }
      search={
        <input
          type="text"
          placeholder="Search by name, owner, lifecycle, field, or table..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-border-strong rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      }
    >
      {loading ? (
        <div className="text-center py-12 text-muted">Loading business objects...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-muted">
          {businessObjects.length === 0
            ? 'No business objects found in the selected app.'
            : 'No matches for your search.'}
        </div>
      ) : (
        <div className="bg-surface rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-bg">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Object ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Lifecycle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-meta uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-border">
              {filteredItems.map((bo) => {
                const isExpanded = expanded[bo.id];
                const hasChildren = bo.childObjects && bo.childObjects.length > 0;
                return (
                  <Fragment key={bo.id}>
                    <tr className="hover:bg-bg">
                      <td className="px-6 py-4 text-sm font-medium text-fg">
                        {bo.id}
                        {hasChildren && (
                          <span className="ml-2 text-xs text-meta">
                            ({bo.childObjects!.length} table part{bo.childObjects!.length !== 1 ? 's' : ''})
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-fg">{bo.name}</td>
                      <td className="px-6 py-4 text-sm text-muted">{bo.owner}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                            bo.lifecycle === 'active'
                              ? 'bg-success-muted text-success-fg'
                              : bo.lifecycle === 'draft'
                                ? 'bg-warn-muted text-warn-fg'
                                : bo.lifecycle === 'deprecated'
                                  ? 'bg-secondary-soft text-secondary-soft-fg'
                                  : 'bg-surface-muted text-fg'
                          }`}
                        >
                          {bo.lifecycle}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted">
                        {bo.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(bo.id)}
                          className="text-accent hover:text-accent-fg font-medium"
                        >
                          {isExpanded ? 'Hide' : 'View'} structure
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-bg">
                        <td colSpan={6} className="px-6 py-6">
                          <div className="grid gap-6 md:grid-cols-2">
                            <section>
                              <h3 className="text-sm font-semibold text-fg mb-3">
                                Fields ({bo.fields.length})
                              </h3>
                              {bo.fields.length === 0 ? (
                                <div className="text-sm text-meta">No fields documented.</div>
                              ) : (
                                <div className="space-y-2">
                                  {bo.fields.map((field) => (
                                    <div
                                      key={field.name}
                                      className="border border-border rounded-lg p-3 bg-surface"
                                    >
                                      <div className="flex justify-between items-center text-sm font-medium text-fg">
                                        <span>{field.name}</span>
                                        <span className="text-xs uppercase tracking-wide text-meta">
                                          {field.type}
                                        </span>
                                      </div>
                                      {field.description && (
                                        <p className="mt-1 text-sm text-muted">
                                          {field.description}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </section>

                            <section>
                              <h3 className="text-sm font-semibold text-fg mb-3">
                                Tables ({bo.tables?.length || 0})
                              </h3>
                              {bo.tables && bo.tables.length > 0 ? (
                                <div className="space-y-4">
                                  {bo.tables.map((table) => (
                                    <div
                                      key={table.name}
                                      className="border border-border rounded-lg bg-surface"
                                    >
                                      <div className="p-3 border-b border-border">
                                        <div className="text-sm font-medium text-fg">
                                          {table.name}
                                        </div>
                                        {table.description && (
                                          <p className="mt-1 text-sm text-muted">
                                            {table.description}
                                          </p>
                                        )}
                                      </div>
                                      {table.columns && table.columns.length > 0 && (
                                        <div className="p-3">
                                          <table className="w-full text-sm">
                                            <thead>
                                              <tr className="text-left text-xs uppercase text-meta">
                                                <th className="pb-1">Column</th>
                                                <th className="pb-1">Type</th>
                                                <th className="pb-1">Description</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {table.columns.map((column) => (
                                                <tr key={column.name} className="text-fg-2">
                                                  <td className="py-1 font-medium">{column.name}</td>
                                                  <td className="py-1 text-xs uppercase text-meta">
                                                    {column.type}
                                                  </td>
                                                  <td className="py-1 text-meta">
                                                    {column.description || '-'}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-meta">No tables mapped.</div>
                              )}
                            </section>
                          </div>

                          {/* Table Parts Section */}
                          {hasChildren && (
                            <section className="mt-6 pt-6 border-t border-border-strong">
                              <h3 className="text-sm font-semibold text-fg mb-3">
                                Table Parts ({bo.childObjects!.length})
                              </h3>
                              <div className="space-y-3">
                                {bo.childObjects!.map((child) => {
                                  const childExpanded = expandedChildren[`${bo.id}:${child.id}`];
                                  return (
                                    <div
                                      key={child.id}
                                      className="border border-accent-border rounded-lg bg-accent-soft"
                                    >
                                      <div className="p-3">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-accent font-medium">
                                              Table Part
                                            </span>
                                            <span className="text-sm font-medium text-fg">
                                              {child.id}
                                            </span>
                                            <span className="text-sm text-fg-2">
                                              {child.name}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => toggleChildExpanded(bo.id, child.id)}
                                            className="text-xs text-accent hover:text-accent-fg font-medium"
                                          >
                                            {childExpanded ? 'Hide' : 'Show'} details
                                          </button>
                                        </div>
                                        {child.description && (
                                          <p className="mt-1 text-sm text-muted">
                                            {child.description}
                                          </p>
                                        )}
                                      </div>
                                      {childExpanded && (
                                        <div className="px-3 pb-3 border-t border-accent-border pt-3">
                                          <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                              <h4 className="text-xs font-semibold text-fg-2 mb-2">
                                                Fields ({child.fields.length})
                                              </h4>
                                              {child.fields.length > 0 ? (
                                                <div className="space-y-1">
                                                  {child.fields.map((field) => (
                                                    <div
                                                      key={field.name}
                                                      className="text-xs bg-surface border border-border rounded p-2"
                                                    >
                                                      <span className="font-medium text-fg">
                                                        {field.name}
                                                      </span>
                                                      <span className="ml-2 text-meta">
                                                        {field.type}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                <div className="text-xs text-meta">
                                                  No fields
                                                </div>
                                              )}
                                            </div>
                                            <div>
                                              <h4 className="text-xs font-semibold text-fg-2 mb-2">
                                                Tables ({child.tables?.length || 0})
                                              </h4>
                                              {child.tables && child.tables.length > 0 ? (
                                                <div className="space-y-2">
                                                  {child.tables.map((table) => (
                                                    <div
                                                      key={table.name}
                                                      className="text-xs bg-surface border border-border rounded p-2"
                                                    >
                                                      <div className="font-medium text-fg">
                                                        {table.name}
                                                      </div>
                                                      {table.description && (
                                                        <div className="text-muted mt-1">
                                                          {table.description}
                                                        </div>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                <div className="text-xs text-meta">
                                                  No tables
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CatalogPageLayout>
  );
}

