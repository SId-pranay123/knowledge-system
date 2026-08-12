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
  if (!counts) return <div className="loading-state">Loading...</div>;

  const cards: { label: string; value: number; page: string }[] = [
    { label: 'People', value: counts.people, page: 'people' },
    { label: 'Projects', value: counts.projects, page: 'projects' },
    { label: 'Clients', value: counts.clients, page: 'clients' },
    { label: 'Decisions', value: counts.decisions, page: 'decisions' },
    { label: 'Topics', value: counts.topics, page: 'topics' },
    { label: 'Documents', value: counts.documents, page: 'documents' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Knowledge Base</h1>
        <p className="page-copy">A connected view of people, projects, clients, decisions, topics, and source documents.</p>
      </div>
      <div className="dashboard-grid">
        {cards.map((c) => (
          <div
            key={c.label}
            onClick={() => onNavigate(c.page)}
            className="stat-card"
          >
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="actions-row">
        <button className="primary-button" onClick={() => onNavigate('ask')}>
          Ask a question →
        </button>
      </div>
    </div>
  );
}
