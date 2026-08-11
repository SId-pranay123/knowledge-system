import { useState } from 'react';

// Minimal shell — 5 pages per the design: Dashboard, Explorer, Entity Detail,
// Connections/Graph, Ask AI. Only "Ask AI" is stubbed end-to-end here as the
// reference; replicate the fetch pattern for the other pages.
export default function App() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    setLoading(true);
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    setAnswer(data.answer);
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Ask the knowledge base</h1>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="What did FinEdge teach us that influenced Lexora?"
        style={{ width: '100%', height: 80 }}
      />
      <button onClick={ask} disabled={loading}>{loading ? 'Asking...' : 'Ask'}</button>
      {answer && <div style={{ marginTop: 20, whiteSpace: 'pre-wrap' }}>{answer}</div>}
    </div>
  );
}
