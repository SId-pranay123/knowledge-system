import { useEffect, useState } from 'react';
import { api } from '../api/client';

type EntityType = 'people' | 'clients' | 'projects' | 'decisions' | 'topics';

const TABS: { key: EntityType; label: string }[] = [
  { key: 'people', label: 'People' },
  { key: 'projects', label: 'Projects' },
  { key: 'clients', label: 'Clients' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'topics', label: 'Topics' },
];

// Row label field differs per entity type (Decision uses `title`, everything
// else uses `name`) — same distinction that matters in ResolutionService.
function getLabel(type: EntityType, row: any): string {
  return type === 'decisions' ? row.title : row.name;
}

export default function Explorer({ onSelect }: { onSelect: (type: EntityType, id: string) => void }) {
  const [activeTab, setActiveTab] = useState<EntityType>('people');
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/${activeTab}`)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [activeTab]);

  const filtered = rows.filter((r) => getLabel(activeTab, r)?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Knowledge Explorer</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={activeTab === t.key ? 'primary-button' : 'secondary-button'}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        placeholder={`Search ${activeTab}...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 16 }}
      />
      {loading ? (
        <div>Loading...</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {filtered.map((row) => (
            <li
              key={row.id}
              onClick={() => onSelect(activeTab, row.id)}
              style={{
                padding: 12,
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
              }}
            >
              <strong>{getLabel(activeTab, row)}</strong>
              {row.role && <span style={{ color: '#666' }}> — {row.role}</span>}
              {row.status && <span style={{ color: '#666' }}> — {row.status}</span>}
            </li>
          ))}
          {filtered.length === 0 && <li style={{ color: '#999', padding: 12 }}>No results.</li>}
        </ul>
      )}
    </div>
  );
}