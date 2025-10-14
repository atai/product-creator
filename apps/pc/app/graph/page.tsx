'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import cytoscape from 'cytoscape';
import { GraphNode, GraphEdge, FunctionCard } from '@/lib/types';

export default function GraphPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [functions, setFunctions] = useState<FunctionCard[]>([]);
  const [filters, setFilters] = useState({
    bounded_context: '',
    lifecycle: '',
  });
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    // Load functions with root filter from URL
    const rootParam = searchParams.get('root');
    const url = rootParam ? `/api/index?root=${encodeURIComponent(rootParam)}` : '/api/index';

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setFunctions(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load functions', err);
        setLoading(false);
      });
  }, [searchParams]);

  useEffect(() => {
    if (loading || !cyRef.current) return;

    const params = new URLSearchParams();
    const rootParam = searchParams.get('root');
    if (rootParam) params.append('root', rootParam);
    if (filters.bounded_context) params.append('bounded_context', filters.bounded_context);
    if (filters.lifecycle) params.append('lifecycle', filters.lifecycle);

    fetch(`/api/graph?${params}`)
      .then((res) => res.json())
      .then(({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
        if (cyInstance.current) {
          cyInstance.current.destroy();
        }

        const elements = [
          ...nodes.map((n) => ({
            data: {
              id: n.id,
              label: n.label,
              bounded_context: n.bounded_context,
              lifecycle: n.lifecycle,
            },
          })),
          ...edges.map((e, idx) => ({
            data: {
              id: `edge-${idx}`,
              source: e.source,
              target: e.target,
              label: e.event,
            },
          })),
        ];

        cyInstance.current = cytoscape({
          container: cyRef.current!,
          elements,
          style: [
            {
              selector: 'node',
              style: {
                label: 'data(label)',
                'text-valign': 'center',
                'text-halign': 'center',
                'background-color': '#4299e1',
                color: '#fff',
                'text-outline-color': '#4299e1',
                'text-outline-width': 2,
                width: 60,
                height: 60,
                'font-size': 10,
              },
            },
            {
              selector: 'node[lifecycle="draft"]',
              style: {
                'background-color': '#ecc94b',
                'text-outline-color': '#ecc94b',
              },
            },
            {
              selector: 'node[lifecycle="active"]',
              style: {
                'background-color': '#48bb78',
                'text-outline-color': '#48bb78',
              },
            },
            {
              selector: 'node[lifecycle="deprecated"]',
              style: {
                'background-color': '#ed8936',
                'text-outline-color': '#ed8936',
              },
            },
            {
              selector: 'node[lifecycle="removed"]',
              style: {
                'background-color': '#a0aec0',
                'text-outline-color': '#a0aec0',
              },
            },
            {
              selector: 'edge',
              style: {
                width: 2,
                'line-color': '#cbd5e0',
                'target-arrow-color': '#cbd5e0',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                label: 'data(label)',
                'font-size': 8,
                color: '#718096',
                'text-rotation': 'autorotate',
              },
            },
          ],
          layout: {
            name: 'cose',
            padding: 50,
            nodeRepulsion: 8000,
            idealEdgeLength: 100,
            edgeElasticity: 100,
          },
        });

        cyInstance.current.on('tap', 'node', (evt) => {
          const node = evt.target;
          const id = node.data('id');
          window.location.href = `/f/${id}`;
        });
      })
      .catch((err) => {
        console.error('Failed to load graph', err);
      });
  }, [loading, filters, searchParams]);

  const uniqueContexts = Array.from(new Set(functions.map((f) => f.bounded_context)));
  const lifecycles = ['draft', 'active', 'deprecated', 'removed'];

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">

        <div className="mb-6 flex gap-4">
          <select
            value={filters.bounded_context}
            onChange={(e) => setFilters({ ...filters, bounded_context: e.target.value })}
            className="px-4 py-2 border rounded"
          >
            <option value="">All Contexts</option>
            {uniqueContexts.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={filters.lifecycle}
            onChange={(e) => setFilters({ ...filters, lifecycle: e.target.value })}
            className="px-4 py-2 border rounded"
          >
            <option value="">All Lifecycles</option>
            {lifecycles.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded shadow p-4">
          <div ref={cyRef} style={{ width: '100%', height: '600px' }} />
        </div>

        <div className="mt-4 bg-white rounded shadow p-4">
          <h3 className="font-semibold mb-2">Legend</h3>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded" />
              <span>Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded" />
              <span>Draft</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-500 rounded" />
              <span>Deprecated</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-400 rounded" />
              <span>Removed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
