import { useEffect, useState } from 'react';
import { api } from '../api/client';

const ENDPOINT_FOR: Record<string, string> = {
  people: '/people',
  clients: '/clients',
  projects: '/projects',
  decisions: '/decisions',
  topics: '/topics',
};

// The "how is this connected" page — directly answers the assignment's
// requirement to see relationships, not just an entity's own fields.
// Fetches the entity itself, then its full relationship neighborhood via
// GET /api/relationships/:entityType/:entityId (1-hop, same endpoint the
// query pipeline's traversal logic is built on).
export default function EntityDetail({
  entityType,
  entityId,
  onSelect,
  onBack,
}: {
  entityType: string;
  entityId: string;
  onSelect: (type: string, id: string) => void;
  onBack: () => void;
}) {
  const [entity, setEntity] = useState<any>(null);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [otherLabels, setOtherLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const singular = entityType.replace(/s$/, '');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`${ENDPOINT_FOR[entityType]}/${entityId}`),
      api.get(`/relationships/${singular}/${entityId}`),
    ])
      .then(async ([e, rels]) => {
        setEntity(e);
        setRelationships(rels);

        // Resolve the label of each connected entity for display. Fine at
        // this scale (a handful of edges per entity); would want a batch
        // endpoint if relationship counts grew much larger.
        const labels: Record<string, string> = {};
        await Promise.all(
          rels.map(async (r: any) => {
            const isSource = r.sourceId === entityId;
            const otherType = isSource ? r.targetType : r.sourceType;
            const otherId = isSource ? r.targetId : r.sourceId;
            const key = `${otherType}:${otherId}`;
            if (labels[key]) return;
            try {
              const other = await api.get(`${ENDPOINT_FOR[`${otherType}s`]}/${otherId}`);
              labels[key] = other.title ?? other.name ?? otherId;
            } catch {
              labels[key] = otherId;
            }
          }),
        );
        setOtherLabels(labels);
      })
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;
  if (!entity) return <div style={{ padding: 40 }}>Not found.</div>;

  const label = entity.title ?? entity.name;

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <button onClick={onBack} className="ghost-button" style={{ marginBottom: 16 }}>← Back</button>
      <h1>{label}</h1>
      {entity.description && <p style={{ color: '#444' }}>{entity.description}</p>}
      {entity.reasoning && (
        <p style={{ color: '#444' }}>
          <strong>Reasoning:</strong> {entity.reasoning}
        </p>
      )}
      {entity.status && <p><strong>Status:</strong> {entity.status}</p>}
      {entity.role && <p><strong>Role:</strong> {entity.role}</p>}
      {entity.email && <p><strong>Email:</strong> {entity.email}</p>}

      <h2 style={{ marginTop: 32 }}>Connections</h2>
      {relationships.length === 0 && <p style={{ color: '#999' }}>No connections yet.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {relationships.map((r) => {
          const isSource = r.sourceId === entityId;
          const otherType = isSource ? r.targetType : r.sourceType;
          const otherId = isSource ? r.targetId : r.sourceId;
          const arrow = isSource ? '→' : '←';
          const label = otherLabels[`${otherType}:${otherId}`] ?? otherId;
          return (
            <li
              key={r.id}
              onClick={() => onSelect(`${otherType}s`, otherId)}
              style={{ padding: 10, borderBottom: '1px solid #eee', cursor: 'pointer' }}
            >
              <span style={{ color: '#888' }}>{r.relationshipType}</span> {arrow}{' '}
              <strong>{label}</strong> <span style={{ color: '#aaa' }}>({otherType})</span>
              {r.metadata?.context && (
                <div style={{ fontSize: 13, color: '#999', marginTop: 2 }}>{r.metadata.context}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}