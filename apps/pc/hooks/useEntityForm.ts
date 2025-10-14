import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

interface UseEntityFormOptions<T> {
  entityName: string; // 'workflow', 'stream', etc.
  apiGetEndpoint: string; // '/api/workflow'
  apiSaveEndpoint: string; // '/api/save-workflow'
  listRoute: string; // '/workflows'
  isNew: boolean;
  onTransformLoad?: (data: T) => unknown; // Transform API data to form data
  onTransformSave?: (formData: unknown) => T; // Transform form data to API data
}

/**
 * Generic hook for entity create/edit forms
 * Handles loading, saving, error states - eliminates duplication
 */
export function useEntityForm<T>(options: UseEntityFormOptions<T>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(!options.isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntity = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${options.apiGetEndpoint}?id=${encodeURIComponent(id)}`);

      if (!response.ok) {
        throw new Error(`${options.entityName} not found`);
      }

      const data: T = await response.json();
      return options.onTransformLoad ? options.onTransformLoad(data) : data;
    } catch (error: any) {
      console.error(`Error loading ${options.entityName}:`, error);
      setError(`Failed to load ${options.entityName}`);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const saveEntity = async (formData: unknown, targetRoot: string) => {
    try {
      setSaving(true);
      setError(null);

      const entityData = options.onTransformSave
        ? options.onTransformSave(formData)
        : formData;

      const response = await fetch(options.apiSaveEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [options.entityName]: entityData,
          targetRoot,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || `Failed to save ${options.entityName}`);
      }

      // Navigate back to list
      const rootParam = searchParams.get('root');
      const listUrl = rootParam
        ? `${options.listRoute}?root=${encodeURIComponent(rootParam)}`
        : options.listRoute;

      router.push(listUrl);
    } catch (error: any) {
      console.error(`Error saving ${options.entityName}:`, error);
      setError(error.message || `Failed to save ${options.entityName}`);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return {
    loading,
    saving,
    error,
    setError,
    loadEntity,
    saveEntity,
  };
}
