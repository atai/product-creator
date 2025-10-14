import { useState, useEffect } from 'react';

/**
 * Generic hook for entity list pages with search and filtering
 * Eliminates duplication between workflows/streams list pages
 */
export function useEntityList<T>(
  apiEndpoint: string,
  searchFields: (item: T) => string[]
) {
  const [items, setItems] = useState<T[]>([]);
  const [filteredItems, setFilteredItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadItems();
  }, []);

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

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(apiEndpoint);
      if (!response.ok) throw new Error('Failed to fetch items');
      const data = await response.json();
      setItems(data);
      setFilteredItems(data);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    items,
    filteredItems,
    loading,
    searchQuery,
    setSearchQuery,
    reload: loadItems,
  };
}
