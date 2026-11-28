'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { LIFECYCLES, type Lifecycle, type GraphNode, type GraphEdge, type Feature } from '@pc/core/types';

cytoscape.use(dagre);

const LIFECYCLE_COLORS: Record<Lifecycle, string> = {
  draft: '#b7791f',
  approved: '#3182ce',
  implemented: '#2f855a',
  deprecated: '#c05621',
  removed: '#718096',
};

const EDGE_KINDS: { kind: GraphEdge['kind']; title: string; color: string; lineStyle: 'solid' | 'dashed' | 'dotted' }[] = [
  { kind: 'calls', title: 'calls', color: '#4a5568', lineStyle: 'solid' },
  { kind: 'workflow', title: 'workflow step', color: '#805ad5', lineStyle: 'dashed' },
  { kind: 'event', title: 'event', color: '#dd6b20', lineStyle: 'dotted' },
];

const NODE_FONT_PX = 12;
const NODE_TEXT_MAX = 150;
const NODE_PAD_X = 12;
const NODE_PAD_Y = 8;
const LINE_HEIGHT = NODE_FONT_PX * 1.25;
const GAP = 24;
const RANK_SEP = GAP * 2.5;
const EDGE_FONT_PX = 10;
/** Free line before and after an edge label: the start of the edge and the whole arrow head stay visible */
const EDGE_LABEL_MARGIN = 20;

let measureCanvas: HTMLCanvasElement | null = null;

/** Size of a node from its label: words wrapped at NODE_TEXT_MAX, the way cytoscape wraps them, plus padding */
function textWidth(text: string, font: string): number {
  measureCanvas = measureCanvas ?? document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * EDGE_FONT_PX * 0.6;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function nodeSize(label: string, font: string): { width: number; height: number } {
  measureCanvas = measureCanvas ?? document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return { width: NODE_TEXT_MAX + 2 * NODE_PAD_X, height: 3 * LINE_HEIGHT };
  ctx.font = font;
  const lines: string[] = [];
  for (const word of label.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && ctx.measureText(`${last} ${word}`).width <= NODE_TEXT_MAX) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
  // +4: rounding of glyph widths between canvas measuring and cytoscape drawing
  return { width: Math.ceil(Math.min(textWidth, NODE_TEXT_MAX) + 2 * NODE_PAD_X + 4), height: Math.ceil(lines.length * LINE_HEIGHT + 2 * NODE_PAD_Y) };
}

/**
 * Linked features: layered layout (dagre) along the arrows, with the real node sizes so labels never overlap.
 * Features without links: a grid below, cells as large as the largest node.
 */
function layoutGraph(cy: cytoscape.Core, edgeFont: string) {
  const linked = cy.nodes().filter((n) => n.degree(false) > 0);
  // Gap between two nodes k ranks apart is at least k·RANK_SEP + (k−1)·(lowest node): enough ranks for the label
  // plus a margin on both sides. Edges without a label keep one rank.
  const lowest = linked.nonempty() ? Math.min(...linked.map((n) => n.height())) : 0;
  const minLen = (edge: cytoscape.EdgeSingular) => {
    const label = String(edge.data('label') ?? '');
    if (!label) return 1;
    const need = textWidth(label, edgeFont) + 2 * EDGE_LABEL_MARGIN;
    return Math.max(1, Math.ceil((need + lowest) / (RANK_SEP + lowest)));
  };
  const single = cy.nodes().difference(linked);
  linked
    .union(linked.connectedEdges())
    .layout({ name: 'dagre', rankDir: 'TB', nodeSep: GAP, rankSep: RANK_SEP, edgeSep: GAP / 2, minLen, fit: false } as cytoscape.LayoutOptions)
    .run();
  if (single.nonempty()) {
    const box = linked.nonempty() ? linked.boundingBox() : { x1: 0, y2: -GAP * 2, w: 0 };
    const cellW = Math.max(...single.map((n) => n.width())) + GAP;
    const cellH = Math.max(...single.map((n) => n.height())) + GAP;
    const cols = Math.max(1, Math.floor(Math.max(box.w, cellW * 6) / cellW));
    const rows = Math.ceil(single.length / cols);
    single
      .layout({ name: 'grid', cols, rows, condense: true, fit: false, avoidOverlap: true, boundingBox: { x1: box.x1, y1: box.y2 + GAP * 2, w: cols * cellW, h: rows * cellH } })
      .run();
  }
  cy.fit(undefined, 30);
}

export default function GraphPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [functions, setFunctions] = useState<Feature[]>([]);
  const [filters, setFilters] = useState({
    bounded_context: '',
    lifecycle: '',
  });
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    // Load functions with app filter from URL
    const appParam = searchParams.get('app');
    const url = appParam ? `/api/features?app=${encodeURIComponent(appParam)}` : '/api/features';

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
    const appParam = searchParams.get('app');
    if (appParam) params.append('app', appParam);
    if (filters.bounded_context) params.append('bounded_context', filters.bounded_context);
    if (filters.lifecycle) params.append('lifecycle', filters.lifecycle);

    fetch(`/api/graph?${params}`)
      .then((res) => res.json())
      .then(({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
        if (cyInstance.current) {
          cyInstance.current.destroy();
        }

        // cytoscape draws labels with this exact font, so the measured size matches what is drawn
        const fontFamily = getComputedStyle(document.body).fontFamily;
        const font = `${NODE_FONT_PX}px ${fontFamily}`;
        const elements = [
          ...nodes.map((n) => {
            const { width, height } = nodeSize(n.label, font);
            return { data: { id: n.id, label: n.label, bounded_context: n.bounded_context, lifecycle: n.lifecycle, w: width, h: height } };
          }),
          ...edges.map((e, idx) => ({
            data: { id: `edge-${idx}`, source: e.source, target: e.target, kind: e.kind, label: e.kind === 'calls' ? '' : e.label },
          })),
        ];

        cyInstance.current = cytoscape({
          container: cyRef.current!,
          elements,
          style: [
            {
              selector: 'node',
              style: {
                shape: 'round-rectangle',
                width: 'data(w)',
                height: 'data(h)',
                label: 'data(label)',
                'text-wrap': 'wrap',
                'text-max-width': `${NODE_TEXT_MAX}px`,
                'text-valign': 'center',
                'text-halign': 'center',
                'font-size': NODE_FONT_PX,
                'font-family': fontFamily,
                color: '#fff',
                'background-color': LIFECYCLE_COLORS.implemented,
              },
            },
            ...LIFECYCLES.map((l) => ({ selector: `node[lifecycle="${l}"]`, style: { 'background-color': LIFECYCLE_COLORS[l] } })),
            {
              selector: 'edge',
              style: {
                width: 2,
                'curve-style': 'bezier',
                'target-arrow-shape': 'triangle',
                'arrow-scale': 1.2,
                label: 'data(label)',
                'font-size': EDGE_FONT_PX,
                'font-family': fontFamily,
                color: '#4a5568',
                'text-rotation': 'autorotate',
                'text-background-color': '#ffffff',
                'text-background-opacity': 0.85,
                'text-background-padding': '2px',
              },
            },
            ...EDGE_KINDS.map((k) => ({
              selector: `edge[kind="${k.kind}"]`,
              style: { 'line-color': k.color, 'target-arrow-color': k.color, 'line-style': k.lineStyle },
            })),
          ],
          layout: { name: 'preset' },
        });
        layoutGraph(cyInstance.current, `${EDGE_FONT_PX}px ${fontFamily}`);

        cyInstance.current.on('tap', 'node', (evt) => {
          const node = evt.target;
          const id = node.data('id');
          window.location.hash = `/features/${encodeURIComponent(id)}`;
        });
      })
      .catch((err) => {
        console.error('Failed to load graph', err);
      });
  }, [loading, filters, searchParams]);

  const uniqueContexts = Array.from(new Set(functions.map((f) => f.bounded_context)));
  const lifecycles = LIFECYCLES;

  if (loading) {
    return (
      <div className="min-h-full p-8">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full p-8">
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

        <div className="bg-surface rounded shadow p-4">
          <div ref={cyRef} style={{ width: '100%', height: '70vh' }} />
        </div>

        <div className="mt-4 bg-surface rounded shadow p-4">
          <h3 className="font-semibold mb-2">Legend</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {LIFECYCLES.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: LIFECYCLE_COLORS[l] }} />
                <span>{l}</span>
              </div>
            ))}
            {EDGE_KINDS.map((k) => (
              <div key={k.kind} className="flex items-center gap-2">
                <svg width="28" height="10" aria-hidden>
                  <line x1="0" y1="5" x2="22" y2="5" stroke={k.color} strokeWidth="2" strokeDasharray={k.lineStyle === 'dashed' ? '5 3' : k.lineStyle === 'dotted' ? '2 3' : undefined} />
                  <polygon points="22,1 28,5 22,9" fill={k.color} />
                </svg>
                <span>{k.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
