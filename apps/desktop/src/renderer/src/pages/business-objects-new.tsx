'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BUSINESS_OBJECT_KINDS, LIFECYCLES, type BusinessObject, type BusinessObjectField, type BusinessObjectKind, type BusinessObjectTable, type BusinessObjectTableColumn } from '@pc/core/types';
import { BASE_FIELD_TYPES, buildTypeOptions } from '@pc/core/businessObjectTypeCatalog';
import { t } from '@/i18n';
import businessObjectSchema from '@pc/core/schema/business-object.schema.json';
import { LanguageTabs, TranslationEditor, useProjectLanguages } from '@/components/TranslationEditor';

type BusinessObjectFormState = {
  id: string;
  name: string;
  description: string;
  owner: string;
  lifecycle: BusinessObject['lifecycle'];
  kind: BusinessObjectKind;
  /** comma-separated feature ids (computed objects) */
  computedBy: string;
  fields: BusinessObjectField[];
  tables: BusinessObjectTable[];
};

const lifecycleOptions = LIFECYCLES;

/** PRODUCTCREATOR-39 */

const defaultField = (): BusinessObjectField => ({
  name: '',
  type: BASE_FIELD_TYPES[0]?.value || 'string(40)',
  description: '',
});

export default function NewBusinessObjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedApp = searchParams.get('app') || '';

  // translations of name, description and field descriptions (PRODUCTCREATOR-37)
  const [i18n, setI18n] = useState<BusinessObject['i18n']>(undefined);
  const [language, setLanguage] = useState('');
  const languages = useProjectLanguages(selectedApp || undefined);
  const primary = languages[0];
  const translating = Boolean(language && language !== primary);
  const [form, setForm] = useState<BusinessObjectFormState>({
    id: '',
    name: '',
    description: '',
    owner: '',
    lifecycle: 'draft',
    kind: 'entity',
    computedBy: '',
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
        const endpoint = selectedApp
          ? `/api/business-objects?app=${encodeURIComponent(selectedApp)}`
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
  }, [selectedApp]);

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
    if (!form.id.trim()) return t('bo.idRequired');
    if (!form.name.trim()) return t('bo.nameRequired');
    if (!form.owner.trim()) return t('bo.ownerRequired');
    if (!selectedApp) return t('bo.selectApp');
    if (!form.fields.length) return t('bo.fieldRequired');
    if (form.fields.some((field) => !field.name.trim() || !field.type.trim())) {
      return t('bo.fieldNameType');
    }
    if (form.tables.some((table) => !table.name.trim())) {
      return t('bo.tableName');
    }
    if (
      form.tables.some(
        (table) =>
          table.columns &&
          table.columns.some((column) => !column.name?.trim() || !column.type?.trim())
      )
    ) {
      return t('bo.columnNameType');
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
            i18n,
            // entity is the default: not written (PRODUCTCREATOR-39)
            kind: form.kind === 'entity' ? undefined : form.kind,
            computedBy: form.kind === 'computed' && form.computedBy.trim() ? form.computedBy.split(/[\s,]+/).filter(Boolean) : undefined,
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
          appId: selectedApp,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || t('bo.saveFailed'));
      }

      const redirectUrl = selectedApp
        ? `/business-objects?app=${encodeURIComponent(selectedApp)}`
        : '/business-objects';
      router.push(redirectUrl);
    } catch (err: unknown) {
      console.error('Failed to save business object', err);
      const message = err instanceof Error ? err.message : t('bo.saveFailed');
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
      <label htmlFor={id} className="text-sm font-medium text-fg-2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border border-border-strong rounded px-3 py-2 text-sm"
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
    <div className="min-h-full bg-bg">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-fg">{t('bo.createTitle')}</h1>
            <p className="text-muted mt-2">
              {t('bo.lead')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const url = selectedApp
                ? `/business-objects?app=${encodeURIComponent(selectedApp)}`
                : '/business-objects';
              router.push(url);
            }}
            className="text-sm text-accent hover:text-accent-fg"
          >
            {t('bo.backToList')}
          </button>
        </div>

        {!selectedApp && (
          <div className="mb-4 rounded border border-warn-border-strong bg-warn-soft px-4 py-3 text-sm text-warn-fg">
            {t('bo.selectAppHint')}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded border border-danger-border bg-danger-muted px-4 py-3 text-sm text-danger-fg-strong">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <LanguageTabs languages={languages} value={language || primary} onChange={setLanguage} />
          {translating && (
            <section className="bg-surface rounded-lg shadow p-6">
              <TranslationEditor schema={businessObjectSchema} entry={form} i18n={i18n} language={language} primary={primary} onChange={(next) => setI18n(next as BusinessObject['i18n'])} />
            </section>
          )}
          <div className={translating ? 'hidden' : 'space-y-8'}>
          <section className="bg-surface rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-fg">{t('bo.overview')}</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="object-id" className="text-sm font-medium text-fg-2">
                  {t('bo.objectId')}
                </label>
                <input
                  id="object-id"
                  value={form.id}
                  onChange={(e) => updateForm('id', e.target.value)}
                  placeholder="customer.profile"
                  className="border border-border-strong rounded px-3 py-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="object-name" className="text-sm font-medium text-fg-2">
                  {t('common.name')}
                </label>
                <input
                  id="object-name"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder={t('bo.namePlaceholder')}
                  className="border border-border-strong rounded px-3 py-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="object-owner" className="text-sm font-medium text-fg-2">
                  {t('common.owner')}
                </label>
                <input
                  id="object-owner"
                  value={form.owner}
                  onChange={(e) => updateForm('owner', e.target.value)}
                  placeholder={t('bo.ownerPlaceholder')}
                  className="border border-border-strong rounded px-3 py-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="object-lifecycle" className="text-sm font-medium text-fg-2">
                  {t('common.lifecycle')}
                </label>
                <select
                  id="object-lifecycle"
                  value={form.lifecycle}
                  onChange={(e) => updateForm('lifecycle', e.target.value as BusinessObject['lifecycle'])}
                  className="border border-border-strong rounded px-3 py-2"
                >
                  {lifecycleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="object-kind" className="text-sm font-medium text-fg-2">
                  {t('bo.kind')}
                </label>
                <select id="object-kind" value={form.kind} onChange={(e) => updateForm('kind', e.target.value as BusinessObjectKind)} className="border border-border-strong rounded px-3 py-2">
                  {BUSINESS_OBJECT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`bo.kindLabel.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
              {form.kind === 'computed' && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="object-computed-by" className="text-sm font-medium text-fg-2">
                    {t('bo.computedBy')}
                  </label>
                  <input id="object-computed-by" value={form.computedBy} onChange={(e) => updateForm('computedBy', e.target.value)} placeholder={t('bo.computedByPlaceholder')} className="border border-border-strong rounded px-3 py-2 font-mono text-sm" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="object-description" className="text-sm font-medium text-fg-2">
                {t('common.description')}
              </label>
              <textarea
                id="object-description"
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                rows={3}
                placeholder={t('bo.descriptionPlaceholder')}
                className="border border-border-strong rounded px-3 py-2"
              />
            </div>
            <div className="text-sm text-meta">
              {t('bo.targetApp')} {selectedApp ? <span className="font-semibold">{selectedApp}</span> : t('bo.notSelected')}
            </div>
          </section>

          <section className="bg-surface rounded-lg shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">{t('bo.fields')}</h2>
              <div className="flex items-center gap-3 text-sm text-meta">
                {loadingTypes ? t('bo.loadingTypes') : t('bo.typesAvailable', { count: typeOptions.length })}
              </div>
            </div>
            <p className="text-sm text-meta">
              {t('bo.fieldsLead')}
            </p>
            <div className="space-y-6">
              {form.fields.map((field, index) => (
                <div key={`field-${index}`} className="border border-border rounded-lg p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-fg-2">Field #{index + 1}</span>
                    {form.fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="text-sm text-danger hover:text-danger-fg-strong"
                      >
                        {t('common.remove')}
                      </button>
                    )}
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-fg-2" htmlFor={`field-name-${index}`}>
                        {t('common.name')}
                      </label>
                      <input
                        id={`field-name-${index}`}
                        value={field.name}
                        onChange={(e) => updateField(index, { name: e.target.value })}
                        placeholder="customer_id"
                        className="border border-border-strong rounded px-3 py-2 text-sm"
                      />
                    </div>
                    {renderTypeSelect(field.type, (value) => updateField(index, { type: value }), `field-type-${index}`, t('bo.type'))}
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-fg-2" htmlFor={`field-desc-${index}`}>
                        {t('common.description')}
                      </label>
                      <input
                        id={`field-desc-${index}`}
                        value={field.description || ''}
                        onChange={(e) => updateField(index, { description: e.target.value })}
                        placeholder={t('bo.fieldDescriptionPlaceholder')}
                        className="border border-border-strong rounded px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addField}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-accent hover:text-accent-fg"
            >
              {t('bo.addField')}
            </button>
          </section>

  <section className="bg-surface rounded-lg shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">{t('bo.tables')}</h2>
              <p className="text-sm text-meta">
                {t('bo.tablesLead')}
              </p>
            </div>

            {form.tables.length === 0 ? (
              <div className="text-sm text-meta border border-dashed border-border-strong rounded-lg p-6 text-center">
                {t('bo.noTables')}
              </div>
            ) : (
              <div className="space-y-6">
                {form.tables.map((table, tableIndex) => (
                  <div key={`table-${tableIndex}`} className="border border-border rounded-lg p-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-fg-2">Table #{tableIndex + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeTable(tableIndex)}
                        className="text-sm text-danger hover:text-danger-fg-strong"
                      >
                        {t('bo.removeTable')}
                      </button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`table-name-${tableIndex}`} className="text-sm font-medium text-fg-2">
                          {t('common.name')}
                        </label>
                        <input
                          id={`table-name-${tableIndex}`}
                          value={table.name}
                          onChange={(e) => updateTable(tableIndex, { name: e.target.value })}
                          placeholder="dim_customer"
                          className="border border-border-strong rounded px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`table-desc-${tableIndex}`} className="text-sm font-medium text-fg-2">
                          {t('common.description')}
                        </label>
                        <input
                          id={`table-desc-${tableIndex}`}
                          value={table.description || ''}
                          onChange={(e) => updateTable(tableIndex, { description: e.target.value })}
                          placeholder={t('bo.tableDescriptionPlaceholder')}
                          className="border border-border-strong rounded px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-fg-2">{t('bo.columns')}</h3>
                      {(table.columns || []).length === 0 ? (
                        <div className="text-sm text-meta border border-dashed border-border rounded p-4">
                          {t('bo.noColumns')}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {table.columns?.map((column, columnIndex) => (
                            <div key={`column-${tableIndex}-${columnIndex}`} className="grid md:grid-cols-3 gap-4">
                              <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-fg-2" htmlFor={`column-name-${tableIndex}-${columnIndex}`}>
                                  {t('bo.columnName')}
                                </label>
                                <input
                                  id={`column-name-${tableIndex}-${columnIndex}`}
                                  value={column.name}
                                  onChange={(e) => updateColumn(tableIndex, columnIndex, { name: e.target.value })}
                                  placeholder="customer_id"
                                  className="border border-border-strong rounded px-3 py-2 text-sm"
                                />
                              </div>
                              {renderTypeSelect(
                                column.type,
                                (value) => updateColumn(tableIndex, columnIndex, { type: value }),
                                `column-type-${tableIndex}-${columnIndex}`,
                                t('bo.type')
                              )}
                              <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-fg-2" htmlFor={`column-desc-${tableIndex}-${columnIndex}`}>
                                  {t('common.description')}
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    id={`column-desc-${tableIndex}-${columnIndex}`}
                                    value={column.description || ''}
                                    onChange={(e) =>
                                      updateColumn(tableIndex, columnIndex, { description: e.target.value })
                                    }
                                    placeholder={t('bo.columnDescriptionPlaceholder')}
                                    className="border border-border-strong rounded px-3 py-2 text-sm flex-1"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeColumn(tableIndex, columnIndex)}
                                    className="text-xs text-danger hover:text-danger-fg-strong px-3"
                                  >
                                    {t('common.remove')}
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
                        className="text-sm text-accent hover:text-accent-fg"
                      >
                        {t('bo.addColumn')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addTable}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-accent hover:text-accent-fg"
            >
              {t('bo.addTable')}
            </button>
          </section>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                const url = selectedApp
                  ? `/business-objects?app=${encodeURIComponent(selectedApp)}`
                  : '/business-objects';
                router.push(url);
              }}
              className="px-4 py-2 border border-border-strong rounded-md text-sm text-fg-2 hover:bg-bg"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !selectedApp}
              className={`px-4 py-2 rounded-md text-sm font-medium text-on ${
                saving || !selectedApp
                  ? 'bg-surface-disabled cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover'
              }`}
            >
              {saving ? t('common.saving') : t('bo.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

