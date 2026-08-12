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
    <div className="ask-layout">
      <aside className="chat-sidebar">
        <button className="primary-button new-chat-button" onClick={startNewChat}>
          + New chat
        </button>
        <ul className="chat-list">
          {conversations.map((c) => (
            <li
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`chat-list-item ${c.id === activeId ? 'active' : ''}`}
              title={c.title}
            >
              {c.title}
            </li>
          ))}
          {conversations.length === 0 && (
            <li className="empty-state">
              <span className="empty-state-icon">·</span>
              <span>No chats yet.</span>
            </li>
          )}
        </ul>
      </aside>

      <div className="ask-main">
        <div className="page-header">
          <h1>Ask the knowledge base</h1>
          <p className="page-copy">Ask questions against the graph and source documents, then revisit past answers from the sidebar.</p>
        </div>

        <div className="message-list">
          {messages.map((m) => (
            <div key={m.id} className="message-card">
              <div className="message-question">{m.question}</div>
              <div className="answer-content">
                <ReactMarkdown>{m.answer}</ReactMarkdown>
              </div>
            </div>
          ))}
          {!activeId && messages.length === 0 && (
            <div className="empty-state list-card">
              <span className="empty-state-icon">·</span>
              <span>Start a new chat or select one from the sidebar.</span>
            </div>
          )}
        </div>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What did we learn from FinEdge that is useful for Lexora?"
          className="input-field ask-textarea"
        />
        <div className="ask-submit-row">
          <button className="primary-button" onClick={ask} disabled={asking}>
            {asking && <span className="spinner" />}
            {asking ? 'Thinking...' : 'Ask'}
          </button>
        </div>
        {asking && (
          <div className="thinking-note">
            Analyzing your question, traversing the graph, and searching documents...
          </div>
        )}
      </div>
    </div>
  );
}
