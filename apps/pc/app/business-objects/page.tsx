'use client';

import { Fragment, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BusinessObject } from '@/lib/types';
import { useEntityList } from '@/hooks/useEntityList';
import CatalogPageLayout from '@/components/CatalogPageLayout';

export default function BusinessObjectsPage() {
  const searchParams = useSearchParams();
  const selectedRoot = searchParams.get('root') || '';
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const {
    items: businessObjects,
    filteredItems,
    loading,
    searchQuery,
    setSearchQuery,
  } = useEntityList<BusinessObject>(
    '/api/business-objects',
    (bo) => [
      bo.id,
      bo.name,
      bo.owner,
      bo.lifecycle,
      bo.description || '',
      ...bo.fields.map((field) => field.name),
      ...((bo.tables || []).map((table) => table.name)),
    ],
    { root: selectedRoot }
  );

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <CatalogPageLayout
      title="Business Objects"
      description="Доменные сущности с полями, таблицами и описаниями. Используйте поиск, чтобы быстро найти нужный объект."
      hintKey="businessObjects"
      actions={
        <div className="flex flex-col gap-2 text-right">
          <div className="text-sm text-gray-500">
            {selectedRoot ? `Directory: ${selectedRoot}` : 'All directories'}
          </div>
          <a
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
            href={`/business-objects/new${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`}
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
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      }
    >
      {loading ? (
        <div className="text-center py-12 text-gray-600">Loading business objects...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          {businessObjects.length === 0
            ? 'No business objects found in the selected directory.'
            : 'No matches for your search.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Object ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lifecycle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((bo) => {
                const isExpanded = expanded[bo.id];
                return (
                  <Fragment key={bo.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {bo.id}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{bo.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{bo.owner}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                            bo.lifecycle === 'active'
                              ? 'bg-green-100 text-green-800'
                              : bo.lifecycle === 'draft'
                                ? 'bg-yellow-100 text-yellow-800'
                                : bo.lifecycle === 'deprecated'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {bo.lifecycle}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {bo.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(bo.id)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {isExpanded ? 'Hide' : 'View'} structure
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-6">
                          <div className="grid gap-6 md:grid-cols-2">
                            <section>
                              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                                Fields ({bo.fields.length})
                              </h3>
                              {bo.fields.length === 0 ? (
                                <div className="text-sm text-gray-500">No fields documented.</div>
                              ) : (
                                <div className="space-y-2">
                                  {bo.fields.map((field) => (
                                    <div
                                      key={field.name}
                                      className="border border-gray-200 rounded-lg p-3 bg-white"
                                    >
                                      <div className="flex justify-between items-center text-sm font-medium text-gray-900">
                                        <span>{field.name}</span>
                                        <span className="text-xs uppercase tracking-wide text-gray-500">
                                          {field.type}
                                        </span>
                                      </div>
                                      {field.description && (
                                        <p className="mt-1 text-sm text-gray-600">
                                          {field.description}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </section>

                            <section>
                              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                                Tables ({bo.tables?.length || 0})
                              </h3>
                              {bo.tables && bo.tables.length > 0 ? (
                                <div className="space-y-4">
                                  {bo.tables.map((table) => (
                                    <div
                                      key={table.name}
                                      className="border border-gray-200 rounded-lg bg-white"
                                    >
                                      <div className="p-3 border-b border-gray-100">
                                        <div className="text-sm font-medium text-gray-900">
                                          {table.name}
                                        </div>
                                        {table.description && (
                                          <p className="mt-1 text-sm text-gray-600">
                                            {table.description}
                                          </p>
                                        )}
                                      </div>
                                      {table.columns && table.columns.length > 0 && (
                                        <div className="p-3">
                                          <table className="w-full text-sm">
                                            <thead>
                                              <tr className="text-left text-xs uppercase text-gray-500">
                                                <th className="pb-1">Column</th>
                                                <th className="pb-1">Type</th>
                                                <th className="pb-1">Description</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {table.columns.map((column) => (
                                                <tr key={column.name} className="text-gray-700">
                                                  <td className="py-1 font-medium">{column.name}</td>
                                                  <td className="py-1 text-xs uppercase text-gray-500">
                                                    {column.type}
                                                  </td>
                                                  <td className="py-1 text-gray-500">
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
                                <div className="text-sm text-gray-500">No tables mapped.</div>
                              )}
                            </section>
                          </div>
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

