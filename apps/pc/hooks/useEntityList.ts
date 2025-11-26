import { useState, useEffect, useCallback } from 'react';

/**
 * Generic hook for entity list pages with search and filtering
 * Eliminates duplication between workflows/streams list pages
 */
interface UseEntityListOptions {
  root?: string;
}

export function useEntityList<T>(
  apiEndpoint: string,
  searchFields: (item: T) => string[],
  options: UseEntityListOptions = {}
) {
  const [items, setItems] = useState<T[]>([]);
  const [filteredItems, setFilteredItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { root } = options;

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const endpointWithRoot = buildEndpoint(apiEndpoint, root);
      const response = await fetch(endpointWithRoot);
      if (!response.ok) throw new Error('Failed to fetch items');
      const data = await response.json();
      setItems(data);
      setFilteredItems(data);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, root]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    // Filter items by search query
    if (!searchQuery.trim()) {
      setFilteredItems(items);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = items.filter((item) => {
      const fields = searchFields(item);
      return fields.some(field => field.toLowerCase().includes(query));
    });

    setFilteredItems(filtered);
  }, [searchQuery, items]);

  return {
    items,
    filteredItems,
    loading,
    searchQuery,
    setSearchQuery,
    reload: loadItems,
  };
}

const buildEndpoint = (apiEndpoint: string, root?: string) => {
  if (!root) return apiEndpoint;
  const separator = apiEndpoint.includes('?') ? '&' : '?';
  return `${apiEndpoint}${separator}root=${encodeURIComponent(root)}`;
};
