import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface NotionPage {
  id: string;
  title: string;
  lastEditedTime: string;
  url: string;
  alreadyIngested: boolean;
}

// One-click ingestion instead of manually curling a page ID. Lists every
// Notion page shared with the integration (the integration's own access is
// the source of truth for what's ingestable), shows what's already in the
// graph, and lets you trigger ingestion per page with a button.
export default function Sources() {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  function loadPages() {
    setLoading(true);
    setError(null);
    api
      .get('/ingest/notion/pages')
      .then(setPages)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPages();
  }, []);

  async function ingest(pageId: string) {
    setIngestingId(pageId);
    try {
      const result = await api.post('/ingest/notion/page', { pageId });
      setResults((prev) => ({
        ...prev,
        [pageId]: result.skipped
          ? `Already up to date (${result.reason})`
          : `Ingested — ${result.entitiesExtracted} entities, ${result.relationshipsExtracted} relationships`,
      }));
      loadPages(); // refresh so "already ingested" status updates
    } catch (e: any) {
      setResults((prev) => ({ ...prev, [pageId]: `Failed: ${e.message}` }));
    } finally {
      setIngestingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Sources</h1>
      <p style={{ color: '#666' }}>
        Notion pages shared with this app's integration. Click "Ingest" to pull a page into the knowledge graph —
        no need to copy page IDs manually.
      </p>

      {loading && <p>Loading pages...</p>}
      {error && (
        <p style={{ color: '#c00' }}>
          {error.includes('401') || error.includes('403')
            ? 'You need to be logged in to view sources.'
            : `Failed to load pages: ${error}`}
        </p>
      )}

      {!loading && !error && pages.length === 0 && (
        <p style={{ color: '#999' }}>
          No pages are shared with the integration yet. In Notion, open a page → "•••" menu → Connections → add this
          integration.
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {pages.map((p) => (
          <li
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 12,
              borderBottom: '1px solid #eee',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>
                {p.title}{' '}
                {p.alreadyIngested && <span style={{ fontSize: 12, color: '#0a0', fontWeight: 400 }}>(ingested)</span>}
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>
                Last edited {new Date(p.lastEditedTime).toLocaleDateString()}
              </div>
              {results[p.id] && <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{results[p.id]}</div>}
            </div>
            <button className="primary-button" onClick={() => ingest(p.id)} disabled={ingestingId === p.id}>
              {ingestingId === p.id ? 'Ingesting...' : p.alreadyIngested ? 'Re-check' : 'Ingest'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}