import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, WheelEvent } from 'react';
import { api } from '../api/client';

// Explicit maps — see GraphView.tsx/EntityDetail.tsx for why naive
// pluralization (type + 's', .replace(/s$/,'')) is wrong for "person"/"people".
const SINGULAR_TO_PLURAL: Record<string, string> = {
  person: 'people',
  client: 'clients',
  project: 'projects',
  decision: 'decisions',
  topic: 'topics',
};

// Muted, desaturated palette per entity type — not flat primary colors.
// Each has a fill + a slightly darker stroke + a text color chosen for
// contrast against that fill.
const TYPE_STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
  person: { fill: '#8CA6C9', stroke: '#5F7A9E', text: '#1a2733' },
  project: { fill: '#8FB88A', stroke: '#638F5E', text: '#152413' },
  client: { fill: '#D9A66C', stroke: '#B37F42', text: '#2b1c0a' },
  decision: { fill: '#A88FC9', stroke: '#7C5FA0', text: '#1f1329' },
  topic: { fill: '#A9A9A2', stroke: '#7E7E76', text: '#1c1c1a' },
};
const TYPE_ORDER = ['person', 'project', 'client', 'decision', 'topic'];
const DEFAULT_VISIBLE_TYPES: Record<string, boolean> = {
  person: true,
  project: true,
  client: true,
  decision: true,
  topic: false,
};

interface Node {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Edge {
  sourceId: string;
  targetId: string;
  relationshipType: string;
}

export default function GlobalGraph({ onSelect }: { onSelect: (type: string, id: string) => void }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleTypes, setVisibleTypes] = useState(DEFAULT_VISIBLE_TYPES);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const width = 1100;
  const height = 750;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/people'),
      api.get('/clients'),
      api.get('/projects'),
      api.get('/decisions'),
      api.get('/topics'),
      api.get('/relationships'),
    ]).then(([people, clients, projects, decisions, topics, relationships]) => {
      const rawNodes: Node[] = [
        ...people.map((p: any) => ({ id: p.id, type: 'person', label: p.name })),
        ...clients.map((c: any) => ({ id: c.id, type: 'client', label: c.name })),
        ...projects.map((p: any) => ({ id: p.id, type: 'project', label: p.name })),
        ...decisions.map((d: any) => ({ id: d.id, type: 'decision', label: d.title })),
        ...topics.map((t: any) => ({ id: t.id, type: 'topic', label: t.name })),
      ].map((n) => ({
        ...n,
        // Start in a rough ring rather than pure random — converges faster
        // and avoids the "everything overlapping at the origin" start state.
        x: width / 2 + (Math.random() - 0.5) * 400,
        y: height / 2 + (Math.random() - 0.5) * 400,
        vx: 0,
        vy: 0,
      }));

      const nodeIds = new Set(rawNodes.map((n) => n.id));
      const rawEdges: Edge[] = relationships
        .filter((r: any) => nodeIds.has(r.sourceId) && nodeIds.has(r.targetId))
        .map((r: any) => ({ sourceId: r.sourceId, targetId: r.targetId, relationshipType: r.relationshipType }));

      // Force-directed layout: repulsion between all pairs, attraction along
      // edges, mild pull toward center so the graph doesn't drift off-canvas.
      // Plain physics, no library — sufficient at tens of nodes.
      const simNodes = [...rawNodes];
      const nodeById = new Map(simNodes.map((n) => [n.id, n]));
      const REPULSION = 4600;
      const ATTRACTION = 0.02;
      const CENTER_PULL = 0.01;
      const DAMPING = 0.85;

      for (let iter = 0; iter < 220; iter++) {
        for (const n of simNodes) {
          let fx = (width / 2 - n.x) * CENTER_PULL;
          let fy = (height / 2 - n.y) * CENTER_PULL;

          for (const other of simNodes) {
            if (other.id === n.id) continue;
            const dx = n.x - other.x;
            const dy = n.y - other.y;
            const distSq = Math.max(dx * dx + dy * dy, 1);
            const force = REPULSION / distSq;
            fx += (dx / Math.sqrt(distSq)) * force;
            fy += (dy / Math.sqrt(distSq)) * force;
          }

          n.vx = (n.vx + fx) * DAMPING;
          n.vy = (n.vy + fy) * DAMPING;
        }

        for (const e of rawEdges) {
          const a = nodeById.get(e.sourceId);
          const b = nodeById.get(e.targetId);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          a.vx += dx * ATTRACTION;
          a.vy += dy * ATTRACTION;
          b.vx -= dx * ATTRACTION;
          b.vy -= dy * ATTRACTION;
        }

        for (const n of simNodes) {
          n.x = Math.max(40, Math.min(width - 40, n.x + n.vx));
          n.y = Math.max(40, Math.min(height - 40, n.y + n.vy));
        }
      }

      setNodes(simNodes);
      setEdges(rawEdges);
    }).finally(() => setLoading(false));
  }, []);

  const visibleNodes = useMemo(() => nodes.filter((n) => visibleTypes[n.type]), [nodes, visibleTypes]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId)),
    [edges, visibleNodeIds],
  );
  const nodeById = useMemo(() => new Map(visibleNodes.map((n) => [n.id, n])), [visibleNodes]);
  const showEdgeLabels = visibleEdges.length <= 30;
  const truncate = (s: string, max = 10) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

  if (loading) return <div className="loading-state">Loading full graph...</div>;

  const toggleType = (type: string) => {
    setVisibleTypes((current) => ({ ...current, [type]: !current[type] }));
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.12 : 0.88;

    setView((current) => {
      const nextScale = Math.min(3, Math.max(0.35, current.scale * zoomFactor));
      const graphX = (pointerX - current.x) / current.scale;
      const graphY = (pointerY - current.y) / current.scale;

      return {
        scale: nextScale,
        x: pointerX - graphX * nextScale,
        y: pointerY - graphY * nextScale,
      };
    });
  };

  const handleMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false };
  };

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    setView((current) => ({ ...current, x: drag.viewX + dx, y: drag.viewY + dy }));
  };

  const stopDragging = () => {
    const moved = Boolean(dragRef.current?.moved);
    suppressClickRef.current = moved;
    dragRef.current = null;
    if (moved) window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleNodeClick = (event: MouseEvent<SVGGElement>, node: Node) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      suppressClickRef.current = false;
      return;
    }
    onSelect(SINGULAR_TO_PLURAL[node.type] ?? `${node.type}s`, node.id);
  };

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>Full knowledge graph</h1>
        <p className="page-copy">All entities and relationships shown together. Click a node to view its details.</p>
      </div>

      <div className="graph-filter-bar">
        {TYPE_ORDER.map((type) => {
          const style = TYPE_STYLE[type];
          return (
            <label key={type} className="graph-filter-option">
              <input
                type="checkbox"
                checked={visibleTypes[type]}
                onChange={() => toggleType(type)}
                style={{ margin: 0, accentColor: style.stroke }}
              />
              <span className="graph-filter-swatch" style={{ background: style.fill, border: `1px solid ${style.stroke}` }} />
              <span>{type}</span>
            </label>
          );
        })}
      </div>

      <svg
        width={width}
        height={height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        className="global-graph-svg"
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {visibleEdges.map((e, i) => {
            const a = nodeById.get(e.sourceId);
            const b = nodeById.get(e.targetId);
            if (!a || !b) return null;
            return (
              <g key={`edge-${i}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd0d6" strokeWidth={1} />
                {showEdgeLabels && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} fontSize={8} fill="#9aa1a8" textAnchor="middle">
                    {e.relationshipType}
                  </text>
                )}
              </g>
            );
          })}

          {visibleNodes.map((n) => {
            const style = TYPE_STYLE[n.type] ?? TYPE_STYLE.topic;
            return (
              <g
                key={n.id}
                onClick={(event) => handleNodeClick(event, n)}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={n.x} cy={n.y} r={22} fill={style.fill} stroke={style.stroke} strokeWidth={1.5} />
                <title>{n.label}</title>
                <text x={n.x} y={n.y} fontSize={9} fill={style.text} textAnchor="middle" dominantBaseline="middle">
                  {truncate(n.label)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
