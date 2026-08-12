import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Explicit plural<->singular maps — NOT naive string concatenation/regex.
// "person" is an irregular plural ("people", not "persons"), which silently
// broke both relationship lookups and connected-entity label resolution
// when handled with `type + 's'` or `.replace(/s$/, '')`.
const PLURAL_TO_SINGULAR: Record<string, string> = {
  people: 'person',
  clients: 'client',
  projects: 'project',
  decisions: 'decision',
  topics: 'topic',
};
const SINGULAR_TO_PLURAL: Record<string, string> = {
  person: 'people',
  client: 'clients',
  project: 'projects',
  decision: 'decisions',
  topic: 'topics',
};
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

  const singular = PLURAL_TO_SINGULAR[entityType] ?? entityType;

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
              const pluralType = SINGULAR_TO_PLURAL[otherType] ?? `${otherType}s`;
              const other = await api.get(`${ENDPOINT_FOR[pluralType]}/${otherId}`);
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

  if (loading) return <div className="loading-state">Loading...</div>;
  if (!entity) return <div className="empty-state"><span className="empty-state-icon">·</span><span>Not found.</span></div>;

  const label = entity.title ?? entity.name;

  return (
    <div className="page">
      <div className="page-header">
        <button className="ghost-button" onClick={onBack}>← Back</button>
        <h1>{label}</h1>
      </div>
      {entity.description && <p className="detail-copy">{entity.description}</p>}
      {entity.reasoning && (
        <p className="detail-copy">
          <strong>Reasoning:</strong> {entity.reasoning}
        </p>
      )}
      {entity.status && <p><strong>Status:</strong> {entity.status}</p>}
      {entity.role && <p><strong>Role:</strong> {entity.role}</p>}
      {entity.email && <p><strong>Email:</strong> {entity.email}</p>}

      <div className="section">
        <h2>Connections</h2>
      </div>
      {relationships.length === 0 && (
        <div className="empty-state list-card">
          <span className="empty-state-icon">·</span>
          <span>No connections yet.</span>
        </div>
      )}
      {relationships.length > 0 && (
        <ul className="list-card">
          {relationships.map((r) => {
            const isSource = r.sourceId === entityId;
            const otherType = isSource ? r.targetType : r.sourceType;
            const otherId = isSource ? r.targetId : r.sourceId;
            const arrow = isSource ? '→' : '←';
            const label = otherLabels[`${otherType}:${otherId}`] ?? otherId;
            return (
              <li
                key={r.id}
                onClick={() => onSelect(SINGULAR_TO_PLURAL[otherType] ?? `${otherType}s`, otherId)}
                className="list-row"
              >
                <span className="muted-text">{r.relationshipType}</span> {arrow}{' '}
                <strong>{label}</strong> <span className="soft-text">({otherType})</span>
                {r.metadata?.context && (
                  <div className="relationship-meta">{r.metadata.context}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
