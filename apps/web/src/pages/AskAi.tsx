import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api/client';

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
interface Message {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}

// Chat-session UI: a sidebar of past conversations (like Claude/ChatGPT),
// each holding its own question+answer history, persisted server-side —
// nothing is recomputed when revisiting a past chat, the stored answer is
// shown directly.
export default function AskAI() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  const loadConversations = () => api.get('/conversations').then(setConversations);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    api.get(`/conversations/${activeId}`).then((c) => setMessages(c.messages));
  }, [activeId]);

  async function startNewChat() {
    const conv = await api.post('/conversations', {});
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
  }

  async function ask() {
    if (!question.trim()) return;
    let convId = activeId;
    if (!convId) {
      const conv = await api.post('/conversations', {});
      convId = conv.id;
      setActiveId(convId);
    }

    setAsking(true);
    const q = question;
    setQuestion('');
    try {
      const message = await api.post(`/conversations/${convId}/messages`, { question: q });
      setMessages((prev) => [...prev, message]);
      loadConversations(); // refresh sidebar: title may have just been set, ordering bumped
    } finally {
      setAsking(false);
    }
  }

  return (
    <div style={{ display: 'flex', maxWidth: 1000, margin: '40px auto', gap: 24, fontFamily: 'sans-serif' }}>
      <aside style={{ width: 220, flexShrink: 0 }}>
        <button className="primary-button" onClick={startNewChat} style={{ width: '100%', marginBottom: 16 }}>
          + New chat
        </button>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {conversations.map((c) => (
            <li
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: c.id === activeId ? '#eef' : 'transparent',
                fontSize: 14,
                marginBottom: 4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={c.title}
            >
              {c.title}
            </li>
          ))}
          {conversations.length === 0 && <li style={{ color: '#999', fontSize: 13 }}>No chats yet.</li>}
        </ul>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h1>Ask the knowledge base</h1>

        <div style={{ marginBottom: 20 }}>
          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{m.question}</div>
              <div className="answer-content">
                <ReactMarkdown>{m.answer}</ReactMarkdown>
              </div>
            </div>
          ))}
          {!activeId && messages.length === 0 && (
            <p style={{ color: '#999' }}>Start a new chat or select one from the sidebar.</p>
          )}
        </div>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What did we learn from FinEdge that is useful for Lexora?"
          style={{ width: '100%', height: 80 }}
        />
        <button className="primary-button" onClick={ask} disabled={asking} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {asking && (
            <span
              style={{
                width: 14,
                height: 14,
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.7s linear infinite',
              }}
            />
          )}
          {asking ? 'Thinking...' : 'Ask'}
        </button>
        {asking && (
          <div style={{ marginTop: 16, color: '#999', fontSize: 14 }}>
            Analyzing your question, traversing the graph, and searching documents...
          </div>
        )}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}