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
    <div className="page">
      <div className="page-header">
        <h1>Knowledge Explorer</h1>
        <p className="page-copy">Browse entities by type and open any record to inspect its context and relationships.</p>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={activeTab === t.key ? 'primary-button' : 'secondary-button'}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        placeholder={`Search ${activeTab}...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field"
      />
      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : (
        <ul className="list-card section">
          {filtered.map((row) => (
            <li
              key={row.id}
              onClick={() => onSelect(activeTab, row.id)}
              className="list-row"
            >
              <strong className="list-row-title">{getLabel(activeTab, row)}</strong>
              {row.role && <span className="muted-text"> — {row.role}</span>}
              {row.status && <span className="muted-text"> — {row.status}</span>}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="empty-state">
              <span className="empty-state-icon">·</span>
              <span>No results.</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
