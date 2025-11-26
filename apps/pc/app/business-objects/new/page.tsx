'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BusinessObject,
  BusinessObjectField,
  BusinessObjectTable,
  BusinessObjectTableColumn,
} from '@/lib/types';
import { BASE_FIELD_TYPES, buildTypeOptions } from '@/lib/businessObjectTypeCatalog';

type BusinessObjectFormState = {
  id: string;
  name: string;
  description: string;
  owner: string;
  lifecycle: BusinessObject['lifecycle'];
  fields: BusinessObjectField[];
  tables: BusinessObjectTable[];
};

const lifecycleOptions: BusinessObject['lifecycle'][] = ['draft', 'active', 'deprecated', 'removed'];

const defaultField = (): BusinessObjectField => ({
  name: '',
  type: BASE_FIELD_TYPES[0]?.value || 'string(40)',
  description: '',
});

export default function NewBusinessObjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRoot = searchParams.get('root') || '';

  const [form, setForm] = useState<BusinessObjectFormState>({
    id: '',
    name: '',
    description: '',
    owner: '',
    lifecycle: 'draft',
    fields: [defaultField()],
    tables: [],
  });

  const [existingObjects, setExistingObjects] = useState<BusinessObject[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadObjects = async () => {
      try {
        setLoadingTypes(true);
        const endpoint = selectedRoot
          ? `/api/business-objects?root=${encodeURIComponent(selectedRoot)}`
          : '/api/business-objects';
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          setExistingObjects(data);
        }
      } catch (err) {
        console.error('Failed to load business objects for type catalog', err);
      } finally {
        setLoadingTypes(false);
      }
    };

    loadObjects();
  }, [selectedRoot]);

  const typeOptions = useMemo(
    () => buildTypeOptions(existingObjects, form.id.trim() || undefined),
    [existingObjects, form.id]
  );

  const updateForm = <K extends keyof BusinessObjectFormState>(key: K, value: BusinessObjectFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateField = (index: number, patch: Partial<BusinessObjectField>) => {
    setForm((prev) => {
      const fields = [...prev.fields];
      fields[index] = { ...fields[index], ...patch };
      return { ...prev, fields };
    });
  };

  const addField = () => {
    setForm((prev) => ({ ...prev, fields: [...prev.fields, defaultField()] }));
  };

  const removeField = (index: number) => {
    setForm((prev) => {
      if (prev.fields.length === 1) return prev;
      const fields = prev.fields.filter((_, idx) => idx !== index);
      return { ...prev, fields };
    });
  };

  const updateTable = (index: number, patch: Partial<BusinessObjectTable>) => {
    setForm((prev) => {
      const tables = [...prev.tables];
      tables[index] = { ...tables[index], ...patch };
      return { ...prev, tables };
    });
  };

  const addTable = () => {
    setForm((prev) => ({
      ...prev,
      tables: [...prev.tables, { name: '', description: '', columns: [] }],
    }));
  };

  const removeTable = (index: number) => {
    setForm((prev) => ({
      ...prev,
      tables: prev.tables.filter((_, idx) => idx !== index),
    }));
  };

  const addColumn = (tableIndex: number) => {
    setForm((prev) => {
      const tables = [...prev.tables];
      const table = tables[tableIndex];
      const columns = table.columns ? [...table.columns] : [];
      columns.push({
        name: '',
        type: typeOptions[0]?.value || BASE_FIELD_TYPES[0]?.value || 'string(40)',
        description: '',
      });
      tables[tableIndex] = { ...table, columns };
      return { ...prev, tables };
    });
  };

  const removeColumn = (tableIndex: number, columnIndex: number) => {
    setForm((prev) => {
      const tables = [...prev.tables];
      const table = tables[tableIndex];
      if (!table.columns) return prev;
      const columns = table.columns.filter((_, idx) => idx !== columnIndex);
      tables[tableIndex] = { ...table, columns };
      return { ...prev, tables };
    });
  };

  const updateColumn = (
    tableIndex: number,
    columnIndex: number,
    patch: Partial<BusinessObjectTableColumn>
  ) => {
    setForm((prev) => {
      const tables = [...prev.tables];
      const table = tables[tableIndex];
      if (!table.columns) return prev;
      const columns = [...table.columns];
      columns[columnIndex] = { ...columns[columnIndex], ...patch };
      tables[tableIndex] = { ...table, columns };
      return { ...prev, tables };
    });
  };

  const validateForm = () => {
    if (!form.id.trim()) return 'ID is required';
    if (!form.name.trim()) return 'Name is required';
    if (!form.owner.trim()) return 'Owner is required';
    if (!selectedRoot) return 'Please select a directory in the header before creating objects.';
    if (!form.fields.length) return 'At least one field is required';
    if (form.fields.some((field) => !field.name.trim() || !field.type.trim())) {
      return 'Each field needs name and type';
    }
    if (form.tables.some((table) => !table.name.trim())) {
      return 'Each table needs a name';
    }
    if (
      form.tables.some(
        (table) =>
          table.columns &&
          table.columns.some((column) => !column.name?.trim() || !column.type?.trim())
      )
    ) {
      return 'Each column needs name and type';
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/save-business-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessObject: {
            ...form,
            fields: form.fields.map((field) => ({
              ...field,
              name: field.name.trim(),
              type: field.type.trim(),
              description: field.description?.trim() || '',
            })),
            tables:
              form.tables.length > 0
                ? form.tables.map((table) => ({
                    ...table,
                    name: table.name.trim(),
                    description: table.description?.trim() || '',
                    columns: table.columns?.map((column) => ({
                      ...column,
                      name: column.name.trim(),
                      type: column.type.trim(),
                      description: column.description?.trim() || '',
                    })),
                  }))
                : undefined,
          },
          targetRoot: selectedRoot,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to save business object');
      }

      const redirectUrl = selectedRoot
        ? `/business-objects?root=${encodeURIComponent(selectedRoot)}`
        : '/business-objects';
      router.push(redirectUrl);
    } catch (err: unknown) {
      console.error('Failed to save business object', err);
      const message = err instanceof Error ? err.message : 'Failed to save business object';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const renderTypeSelect = (
    value: string,
    onChange: (value: string) => void,
    id: string,
    label: string
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border border-gray-300 rounded px-3 py-2 text-sm"
      >
        {typeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.source === 'base' ? option.label : `Object · ${option.label}`}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Business Object</h1>
            <p className="text-gray-600 mt-2">
              Describe canonical fields and how they map into physical tables.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const url = selectedRoot
                ? `/business-objects?root=${encodeURIComponent(selectedRoot)}`
                : '/business-objects';
              router.push(url);
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Back to list
          </button>
        </div>

        {!selectedRoot && (
          <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            Select a directory from the header to choose where the YAML file will be written.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="object-id" className="text-sm font-medium text-gray-700">
                  Object ID
                </label>
                <input
                  id="object-id"
                  value={form.id}
                  onChange={(e) => updateForm('id', e.target.value)}
                  placeholder="customer.profile"
                  className="border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="object-name" className="text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="object-name"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="Customer Profile"
                  className="border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="object-owner" className="text-sm font-medium text-gray-700">
                  Owner
                </label>
                <input
                  id="object-owner"
                  value={form.owner}
                  onChange={(e) => updateForm('owner', e.target.value)}
                  placeholder="Growth Intelligence"
                  className="border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="object-lifecycle" className="text-sm font-medium text-gray-700">
                  Lifecycle
                </label>
                <select
                  id="object-lifecycle"
                  value={form.lifecycle}
                  onChange={(e) => updateForm('lifecycle', e.target.value as BusinessObject['lifecycle'])}
                  className="border border-gray-300 rounded px-3 py-2"
                >
                  {lifecycleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="object-description" className="text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id="object-description"
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                rows={3}
                placeholder="Explain the business purpose and downstream consumers."
                className="border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div className="text-sm text-gray-500">
              Target directory: {selectedRoot ? <span className="font-semibold">{selectedRoot}</span> : 'Not selected'}
            </div>
          </section>

          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Fields</h2>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                {loadingTypes ? 'Loading types…' : `${typeOptions.length} types available`}
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Describe the canonical data contract. Type options include base primitives and other business objects.
            </p>
            <div className="space-y-6">
              {form.fields.map((field, index) => (
                <div key={`field-${index}`} className="border border-gray-200 rounded-lg p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">Field #{index + 1}</span>
                    {form.fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700" htmlFor={`field-name-${index}`}>
                        Name
                      </label>
                      <input
                        id={`field-name-${index}`}
                        value={field.name}
                        onChange={(e) => updateField(index, { name: e.target.value })}
                        placeholder="customer_id"
                        className="border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    {renderTypeSelect(field.type, (value) => updateField(index, { type: value }), `field-type-${index}`, 'Type')}
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700" htmlFor={`field-desc-${index}`}>
                        Description
                      </label>
                      <input
                        id={`field-desc-${index}`}
                        value={field.description || ''}
                        onChange={(e) => updateField(index, { description: e.target.value })}
                        placeholder="What does this field represent?"
                        className="border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addField}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              + Add field
            </button>
          </section>

  <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Tables</h2>
              <p className="text-sm text-gray-500">
                Map the business definition to physical storage. Optional but helpful for data engineers.
              </p>
            </div>

            {form.tables.length === 0 ? (
              <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-6 text-center">
                No tables added yet.
              </div>
            ) : (
              <div className="space-y-6">
                {form.tables.map((table, tableIndex) => (
                  <div key={`table-${tableIndex}`} className="border border-gray-200 rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Table #{tableIndex + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeTable(tableIndex)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove table
                      </button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`table-name-${tableIndex}`} className="text-sm font-medium text-gray-700">
                          Name
                        </label>
                        <input
                          id={`table-name-${tableIndex}`}
                          value={table.name}
                          onChange={(e) => updateTable(tableIndex, { name: e.target.value })}
                          placeholder="dim_customer"
                          className="border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`table-desc-${tableIndex}`} className="text-sm font-medium text-gray-700">
                          Description
                        </label>
                        <input
                          id={`table-desc-${tableIndex}`}
                          value={table.description || ''}
                          onChange={(e) => updateTable(tableIndex, { description: e.target.value })}
                          placeholder="Purpose of this table"
                          className="border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-700">Columns</h3>
                      {(table.columns || []).length === 0 ? (
                        <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded p-4">
                          No columns defined yet.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {table.columns?.map((column, columnIndex) => (
                            <div key={`column-${tableIndex}-${columnIndex}`} className="grid md:grid-cols-3 gap-4">
                              <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700" htmlFor={`column-name-${tableIndex}-${columnIndex}`}>
                                  Column name
                                </label>
                                <input
                                  id={`column-name-${tableIndex}-${columnIndex}`}
                                  value={column.name}
                                  onChange={(e) => updateColumn(tableIndex, columnIndex, { name: e.target.value })}
                                  placeholder="customer_id"
                                  className="border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                              </div>
                              {renderTypeSelect(
                                column.type,
                                (value) => updateColumn(tableIndex, columnIndex, { type: value }),
                                `column-type-${tableIndex}-${columnIndex}`,
                                'Type'
                              )}
                              <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-700" htmlFor={`column-desc-${tableIndex}-${columnIndex}`}>
                                  Description
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    id={`column-desc-${tableIndex}-${columnIndex}`}
                                    value={column.description || ''}
                                    onChange={(e) =>
                                      updateColumn(tableIndex, columnIndex, { description: e.target.value })
                                    }
                                    placeholder="How this column maps to the object"
                                    className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeColumn(tableIndex, columnIndex)}
                                    className="text-xs text-red-600 hover:text-red-800 px-3"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => addColumn(tableIndex)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        + Add column
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addTable}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              + Add table
            </button>
          </section>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                const url = selectedRoot
                  ? `/business-objects?root=${encodeURIComponent(selectedRoot)}`
                  : '/business-objects';
                router.push(url);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !selectedRoot}
              className={`px-4 py-2 rounded-md text-sm font-medium text-white ${
                saving || !selectedRoot
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {saving ? 'Saving…' : 'Save object'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

