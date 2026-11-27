'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { Workflow } from '@pc/core/types';
import FormHelpHint from '@/components/FormHelpHint';

type WorkflowFormData = {
  workflow: string;
  name: string;
  steps: { value: string }[];
  emits: { value: string }[];
  compensations: { stepId: string; compensationId: string }[];
};

export default function WorkflowEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflowId = params.id as string;
  const isNew = workflowId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string>('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WorkflowFormData>({
    defaultValues: {
      workflow: '',
      name: '',
      steps: [],
      emits: [],
      compensations: [],
    },
  });

  const {
    fields: stepFields,
    append: appendStep,
    remove: removeStep,
  } = useFieldArray({
    control,
    name: 'steps',
  });

  const {
    fields: emitFields,
    append: appendEmit,
    remove: removeEmit,
  } = useFieldArray({
    control,
    name: 'emits',
  });

  const {
    fields: compensationFields,
    append: appendCompensation,
    remove: removeCompensation,
  } = useFieldArray({
    control,
    name: 'compensations',
  });

  useEffect(() => {
    const appParam = searchParams.get('app');
    if (appParam) {
      setSelectedApp(appParam);
    }
    if (!isNew) {
      loadWorkflow();
    }
  }, [workflowId, searchParams]);

  const loadWorkflow = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workflow?id=${encodeURIComponent(workflowId)}`);

      if (!response.ok) {
        throw new Error('Workflow not found');
      }

      const workflow: Workflow = await response.json();

      reset({
        workflow: workflow.workflow,
        name: workflow.name || '',
        steps: workflow.steps.map(step => ({ value: step })),
        emits: (workflow.emits || []).map(emit => ({ value: emit })),
        compensations: Object.entries(workflow.compensations || {}).map(([stepId, compensationId]) => ({
          stepId,
          compensationId,
        })),
      });
    } catch (error) {
      console.error('Error loading workflow:', error);
      setError('Failed to load workflow');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: WorkflowFormData) => {
    try {
      setSaving(true);
      setError(null);

      const workflow: Workflow = {
        workflow: data.workflow,
        name: data.name || undefined,
        steps: data.steps.map(s => s.value).filter(v => v.trim()),
        emits: data.emits.map(e => e.value).filter(v => v.trim()),
        compensations: data.compensations.reduce((acc, { stepId, compensationId }) => {
          if (stepId.trim() && compensationId.trim()) {
            acc[stepId] = compensationId;
          }
          return acc;
        }, {} as Record<string, string>),
      };

      const response = await fetch('/api/save-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow, appId: selectedApp }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to save workflow');
      }

      router.push(`/workflows${selectedApp ? `?app=${encodeURIComponent(selectedApp)}` : ''}`);
    } catch (error: unknown) {
      console.error('Error saving workflow:', error);
      setError((error as Error).message || 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-bg">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-bg">

      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="mb-6 flex items-center">
          <h1 className="text-3xl font-bold text-fg">
            {isNew ? 'New Workflow' : 'Edit Workflow'}
          </h1>
          <FormHelpHint hintKey="workflowDetail" />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-danger-muted border border-danger-border-soft rounded text-danger-fg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-surface p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-fg mb-4">Basic Information</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1">
                  Workflow ID *
                </label>
                <input
                  {...register('workflow', { required: 'Workflow ID is required' })}
                  disabled={!isNew}
                  placeholder="context.workflow_name"
                  className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent disabled:bg-surface-muted"
                />
                {errors.workflow && (
                  <p className="mt-1 text-sm text-danger">{errors.workflow.message}</p>
                )}
                <p className="mt-1 text-sm text-meta">Format: context.name (e.g., identity.onboard)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-2 mb-1">
                  Name
                </label>
                <input
                  {...register('name')}
                  placeholder="Human-readable name"
                  className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-fg">Steps *</h2>
              <button
                type="button"
                onClick={() => appendStep({ value: '' })}
                className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
              >
                Add Step
              </button>
            </div>

            <div className="space-y-2">
              {stepFields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      {...register(`steps.${index}.value` as const, {
                        required: 'Step is required',
                      })}
                      placeholder="Function ID (e.g., identity.user.register)"
                      className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    className="px-3 py-2 text-danger hover:text-danger-fg-strong"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {stepFields.length === 0 && (
                <p className="text-sm text-meta italic">No steps added yet</p>
              )}
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-fg">Events Emitted</h2>
              <button
                type="button"
                onClick={() => appendEmit({ value: '' })}
                className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
              >
                Add Event
              </button>
            </div>

            <div className="space-y-2">
              {emitFields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      {...register(`emits.${index}.value` as const)}
                      placeholder="Event name (e.g., user.registered)"
                      className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEmit(index)}
                    className="px-3 py-2 text-danger hover:text-danger-fg-strong"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {emitFields.length === 0 && (
                <p className="text-sm text-meta italic">No events added yet</p>
              )}
            </div>
          </div>

          <div className="bg-surface p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-fg">Compensations</h2>
              <button
                type="button"
                onClick={() => appendCompensation({ stepId: '', compensationId: '' })}
                className="px-3 py-1 text-sm bg-accent text-on rounded hover:bg-accent-hover"
              >
                Add Compensation
              </button>
            </div>

            <div className="space-y-3">
              {compensationFields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <input
                        {...register(`compensations.${index}.stepId` as const)}
                        placeholder="Step function ID"
                        className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <input
                        {...register(`compensations.${index}.compensationId` as const)}
                        placeholder="Compensation function ID"
                        className="w-full px-3 py-2 border border-border-strong rounded focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCompensation(index)}
                    className="px-3 py-2 text-danger hover:text-danger-fg-strong"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {compensationFields.length === 0 && (
                <p className="text-sm text-meta italic">No compensations defined</p>
              )}
            </div>
            <p className="mt-2 text-sm text-meta">
              Define rollback functions for each step in case of failure
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-accent text-on rounded hover:bg-accent-hover disabled:bg-accent-disabled"
            >
              {saving ? 'Saving...' : 'Save Workflow'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
