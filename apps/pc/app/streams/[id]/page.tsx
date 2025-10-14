'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { Stream, StreamStage } from '@/lib/types';

type StreamFormData = {
  stream: string;
  name: string;
  goal: string;
  kpis: { value: string }[];
  stages: {
    name: string;
    entry_events: { value: string }[];
    exit_events: { value: string }[];
    workflows: { value: string }[];
  }[];
  rules: {
    unique_function_per_stage: boolean;
  };
};

export default function StreamEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const streamId = params.id as string;
  const isNew = streamId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roots, setRoots] = useState<{ path: string; label: string }[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<string>('');

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<StreamFormData>({
    defaultValues: {
      stream: '',
      name: '',
      goal: '',
      kpis: [],
      stages: [],
      rules: {
        unique_function_per_stage: false,
      },
    },
  });

  const {
    fields: kpiFields,
    append: appendKpi,
    remove: removeKpi,
  } = useFieldArray({
    control,
    name: 'kpis',
  });

  const {
    fields: stageFields,
    append: appendStage,
    remove: removeStage,
  } = useFieldArray({
    control,
    name: 'stages',
  });

  useEffect(() => {
    loadRoots();
    if (!isNew) {
      loadStream();
    }
  }, [streamId]);

  const loadRoots = async () => {
    try {
      const response = await fetch('/api/roots');
      const data = await response.json();
      setRoots(data.roots || []);

      const rootParam = searchParams.get('root');
      if (rootParam) {
        setSelectedRoot(rootParam);
      } else if (data.roots && data.roots.length > 0) {
        setSelectedRoot(data.roots[0].path);
      }
    } catch (error) {
      console.error('Failed to load roots:', error);
    }
  };

  const loadStream = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/stream?id=${encodeURIComponent(streamId)}`);

      if (!response.ok) {
        throw new Error('Stream not found');
      }

      const stream: Stream = await response.json();

      reset({
        stream: stream.stream,
        name: stream.name || '',
        goal: stream.goal,
        kpis: (stream.kpis || []).map(kpi => ({ value: kpi })),
        stages: stream.stages.map(stage => ({
          name: stage.name,
          entry_events: stage.entry_events.map(e => ({ value: e })),
          exit_events: stage.exit_events.map(e => ({ value: e })),
          workflows: (stage.workflows || []).map(w => ({ value: w })),
        })),
        rules: {
          unique_function_per_stage: stream.rules?.unique_function_per_stage || false,
        },
      });
    } catch (error) {
      console.error('Error loading stream:', error);
      setError('Failed to load stream');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: StreamFormData) => {
    try {
      setSaving(true);
      setError(null);

      const stream: Stream = {
        stream: data.stream,
        name: data.name || undefined,
        goal: data.goal,
        kpis: data.kpis.map(k => k.value).filter(v => v.trim()),
        stages: data.stages.map(stage => ({
          name: stage.name,
          entry_events: stage.entry_events.map(e => e.value).filter(v => v.trim()),
          exit_events: stage.exit_events.map(e => e.value).filter(v => v.trim()),
          workflows: stage.workflows?.map(w => w.value).filter(v => v.trim()),
        })),
        rules: {
          unique_function_per_stage: data.rules.unique_function_per_stage,
        },
      };

      const response = await fetch('/api/save-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream, targetRoot: selectedRoot }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to save stream');
      }

      router.push(`/streams${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`);
    } catch (error: unknown) {
      console.error('Error saving stream:', error);
      setError((error as Error).message || 'Failed to save stream');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {isNew ? 'New Stream' : 'Edit Stream'}
          </h1>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Basic Information</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stream ID *
                </label>
                <input
                  {...register('stream', { required: 'Stream ID is required' })}
                  disabled={!isNew}
                  placeholder="stream_name (lowercase, underscores only)"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
                {errors.stream && (
                  <p className="mt-1 text-sm text-red-600">{errors.stream.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  {...register('name')}
                  placeholder="Human-readable name"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Goal *
                </label>
                <textarea
                  {...register('goal', { required: 'Goal is required' })}
                  placeholder="What is the goal/purpose of this stream?"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                {errors.goal && (
                  <p className="mt-1 text-sm text-red-600">{errors.goal.message}</p>
                )}
              </div>

              {roots.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Directory *
                  </label>
                  <select
                    value={selectedRoot}
                    onChange={(e) => setSelectedRoot(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  >
                    {roots.map((root) => (
                      <option key={root.path} value={root.path}>
                        {root.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">KPIs</h2>
              <button
                type="button"
                onClick={() => appendKpi({ value: '' })}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add KPI
              </button>
            </div>

            <div className="space-y-2">
              {kpiFields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      {...register(`kpis.${index}.value` as const)}
                      placeholder="KPI metric name"
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeKpi(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ))}

              {kpiFields.length === 0 && (
                <p className="text-sm text-gray-500 italic">No KPIs defined</p>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Stages *</h2>
              <button
                type="button"
                onClick={() =>
                  appendStage({
                    name: '',
                    entry_events: [],
                    exit_events: [],
                    workflows: [],
                  })
                }
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add Stage
              </button>
            </div>

            <div className="space-y-4">
              {stageFields.map((stageField, stageIndex) => (
                <StageEditor
                  key={stageField.id}
                  stageIndex={stageIndex}
                  register={register}
                  control={control}
                  removeStage={removeStage}
                />
              ))}

              {stageFields.length === 0 && (
                <p className="text-sm text-gray-500 italic">No stages added yet</p>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Rules</h2>

            <div className="flex items-center">
              <input
                {...register('rules.unique_function_per_stage')}
                type="checkbox"
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <label className="ml-2 text-sm text-gray-700">
                Unique function per stage (a function cannot appear in multiple stages)
              </label>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
            >
              {saving ? 'Saving...' : 'Save Stream'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StageEditor({
  stageIndex,
  register,
  control,
  removeStage,
}: {
  stageIndex: number;
  register: ReturnType<typeof useForm<StreamFormData>>['register'];
  control: ReturnType<typeof useForm<StreamFormData>>['control'];
  removeStage: (index: number) => void;
}) {
  const {
    fields: entryEventFields,
    append: appendEntryEvent,
    remove: removeEntryEvent,
  } = useFieldArray({
    control,
    name: `stages.${stageIndex}.entry_events` as const,
  });

  const {
    fields: exitEventFields,
    append: appendExitEvent,
    remove: removeExitEvent,
  } = useFieldArray({
    control,
    name: `stages.${stageIndex}.exit_events` as const,
  });

  const {
    fields: workflowFields,
    append: appendWorkflow,
    remove: removeWorkflow,
  } = useFieldArray({
    control,
    name: `stages.${stageIndex}.workflows` as const,
  });

  return (
    <div className="border border-gray-200 rounded p-4 bg-gray-50">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-medium text-gray-900">Stage {stageIndex + 1}</h3>
        <button
          type="button"
          onClick={() => removeStage(stageIndex)}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          Remove Stage
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stage Name *</label>
          <input
            {...register(`stages.${stageIndex}.name` as const, {
              required: 'Stage name is required',
            })}
            placeholder="discover, qualify, convert, etc."
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">Entry Events *</label>
            <button
              type="button"
              onClick={() => appendEntryEvent({ value: '' })}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {entryEventFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <input
                  {...register(`stages.${stageIndex}.entry_events.${index}.value` as const)}
                  placeholder="event.name"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => removeEntryEvent(index)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">Exit Events *</label>
            <button
              type="button"
              onClick={() => appendExitEvent({ value: '' })}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {exitEventFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <input
                  {...register(`stages.${stageIndex}.exit_events.${index}.value` as const)}
                  placeholder="event.name"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => removeExitEvent(index)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">Workflows (optional)</label>
            <button
              type="button"
              onClick={() => appendWorkflow({ value: '' })}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {workflowFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <input
                  {...register(`stages.${stageIndex}.workflows.${index}.value` as const)}
                  placeholder="context.workflow_name"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => removeWorkflow(index)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
