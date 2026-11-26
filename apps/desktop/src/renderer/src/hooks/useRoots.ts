import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface RootInfo {
  path: string;
  label: string;
}

/**
 * Reusable hook for loading and managing product roots
 * Eliminates duplication across workflow and stream forms
 */
export function useRoots() {
  const searchParams = useSearchParams();
  const [roots, setRoots] = useState<RootInfo[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoots();
  }, []);

  const loadRoots = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/roots');
      const data = await response.json();
      setRoots(data.roots || []);

      // Use root from URL if present, otherwise use first root
      const rootParam = searchParams.get('root');
      if (rootParam) {
        setSelectedRoot(rootParam);
      } else if (data.roots && data.roots.length > 0) {
        setSelectedRoot(data.roots[0].path);
      }
    } catch (error) {
      console.error('Failed to load roots:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    roots,
    selectedRoot,
    setSelectedRoot,
    loading,
  };
}
