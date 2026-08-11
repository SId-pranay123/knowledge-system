import { useEffect, useState } from 'react';
import { api } from '../api/client';

const ENDPOINT_FOR: Record<string, string> = {
  people: '/people',
  clients: '/clients',
  projects: '/projects',
  decisions: '/decisions',
  topics: '/topics',
};

// Visual "connections" view: center entity + its 1-hop neighborhood laid out
// in a circle around it. Plain SVG, no charting library — fine at this scale
// (a handful of edges per entity). Click a node to re-center the graph on it.
export default function GraphView({
  entityType,
  entityId,
  onSelect,
}: {
  entityType: string;
  entityId: string;
  onSelect: (type: string, id: string) => void;
}) {
  const [centerLabel, setCenterLabel] = useState('');
  const [nodes, setNodes] = useState<{ id: string; type: string; label: string; relType: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const singular = entityType.replace(/s$/, '');

  useEffect(() => {
    setLoading(true);
    Promise.all([api.get(`${ENDPOINT_FOR[entityType]}/${entityId}`), api.get(`/relationships/${singular}/${entityId}`)])
      .then(async ([center, rels]) => {
        setCenterLabel(center.title ?? center.name);

        const resolved = await Promise.all(
          rels.map(async (r: any) => {
            const isSource = r.sourceId === entityId;
            const otherType = isSource ? r.targetType : r.sourceType;
            const otherId = isSource ? r.targetId : r.sourceId;
            try {
              const other = await api.get(`${ENDPOINT_FOR[`${otherType}s`]}/${otherId}`);
              return { id: otherId, type: otherType, label: other.title ?? other.name ?? otherId, relType: r.relationshipType };
            } catch {
              return { id: otherId, type: otherType, label: otherId, relType: r.relationshipType };
            }
          }),
        );
        setNodes(resolved);
      })
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) return <div style={{ padding: 40 }}>Loading graph...</div>;

  const width = 700;
  const height = 500;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 180;

  const positioned = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    return { ...n, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#1f2937' }}>Connections: {centerLabel}</h2>
      {nodes.length === 0 && <p style={{ color: '#999' }}>No connections to show.</p>}
      <svg width={width} height={height} style={{ border: '1px solid #eee', borderRadius: 8 }}>
        {positioned.map((n) => (
          <g key={n.id}>
            <line x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#ccc" strokeWidth={1} />
            <text
              x={(cx + n.x) / 2}
              y={(cy + n.y) / 2 - 6}
              fontSize={10}
              fill="#999"
              textAnchor="middle"
            >
              {n.relType}
            </text>
          </g>
        ))}

        {positioned.map((n) => (
          <g key={n.id} onClick={() => onSelect(`${n.type}s`, n.id)} style={{ cursor: 'pointer' }}>
            <circle cx={n.x} cy={n.y} r={28} fill="#eef" stroke="#88a" />
            <text x={n.x} y={n.y} fontSize={10} textAnchor="middle" dominantBaseline="middle">
              {n.label.length > 14 ? n.label.slice(0, 12) + '…' : n.label}
            </text>
          </g>
        ))}

        <circle cx={cx} cy={cy} r={36} fill="#333" />
        <text x={cx} y={cy} fontSize={11} fill="#fff" textAnchor="middle" dominantBaseline="middle">
          {centerLabel.length > 14 ? centerLabel.slice(0, 12) + '…' : centerLabel}
        </text>
      </svg>
    </div>
  );
}