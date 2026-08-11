import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Counts {
  people: number;
  clients: number;
  projects: number;
  decisions: number;
  topics: number;
  documents: number;
}

// Landing page: counts across all entity types. Each count is just
// (await api.get('/x')).length — fine at this scale (hundreds of rows), a
// dedicated /api/stats endpoint would be worth adding if this grows.
export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/people'),
      api.get('/clients'),
      api.get('/projects'),
      api.get('/decisions'),
      api.get('/topics'),
      api.get('/documents'),
    ])
      .then(([people, clients, projects, decisions, topics, documents]) => {
        setCounts({
          people: people.length,
          clients: clients.length,
          projects: projects.length,
          decisions: decisions.length,
          topics: topics.length,
          documents: documents.length,
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">Failed to load dashboard: {error}</div>;
  if (!counts) return <div>Loading...</div>;

  const cards: { label: string; value: number; page: string }[] = [
    { label: 'People', value: counts.people, page: 'people' },
    { label: 'Projects', value: counts.projects, page: 'projects' },
    { label: 'Clients', value: counts.clients, page: 'clients' },
    { label: 'Decisions', value: counts.decisions, page: 'decisions' },
    { label: 'Topics', value: counts.topics, page: 'topics' },
    { label: 'Documents', value: counts.documents, page: 'documents' },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Knowledge Base</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 24 }}>
        {cards.map((c) => (
          <div
            key={c.label}
            onClick={() => onNavigate(c.page)}
            style={{
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: 16,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700 }}>{c.value}</div>
            <div style={{ color: '#666' }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 32 }}>
        <button className="primary-button" onClick={() => onNavigate('ask')}>
          Ask a question →
        </button>
      </div>
    </div>
  );
}