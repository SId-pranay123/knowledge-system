import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Dashboard from './pages/Dashboard';
import Explorer from './pages/Explorer';
import EntityDetail from './pages/EntityDetail';
import GraphView from './pages/GraphView';
import GlobalGraph from './pages/GlobalGraph';
import { setToken } from './api/client';
import AskAI from './pages/AskAi';
import Sources from './pages/Sources';

type Route =
  | { page: 'dashboard' }
  | { page: 'explorer' }
  | { page: 'detail'; entityType: string; entityId: string }
  | { page: 'graph'; entityType: string; entityId: string }
  | { page: 'fullGraph' }
  | { page: 'sources' }
  | { page: 'ask' };

// Simple state-based routing — 6 pages total, a full router library would be
// overkill for this scope. Each page navigates by calling setRoute.
export default function App() {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [asking, setAsking] = useState(false);

  async function login() {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUser, password: loginPass }),
    });
    if (res.ok) {
      const { accessToken } = await res.json();
      setToken(accessToken);
      setLoggedIn(true);
    } else {
      alert('Login failed');
    }
  }

  async function ask() {
    setAsking(true);
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    setAnswer(data.answer);
    setAsking(false);
  }

  const nav = {
    toDashboard: () => setRoute({ page: 'dashboard' }),
    toExplorer: () => setRoute({ page: 'explorer' }),
    toDetail: (entityType: string, entityId: string) => setRoute({ page: 'detail', entityType, entityId }),
    toGraph: (entityType: string, entityId: string) => setRoute({ page: 'graph', entityType, entityId }),
    toFullGraph: () => setRoute({ page: 'fullGraph' }),
    toSources: () => setRoute({ page: 'sources' }),
    toAsk: () => setRoute({ page: 'ask' }),
  };

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <a
          onClick={nav.toDashboard}
          className={`nav-link ${route.page === 'dashboard' ? 'active' : ''}`}
        >
          Dashboard
        </a>
        <a
          onClick={nav.toExplorer}
          className={`nav-link ${route.page === 'explorer' ? 'active' : ''}`}
        >
          Explorer
        </a>
        <a
          onClick={nav.toFullGraph}
          className={`nav-link ${route.page === 'fullGraph' ? 'active' : ''}`}
        >
          Full Graph
        </a>
        <a
          onClick={nav.toSources}
          className={`nav-link ${route.page === 'sources' ? 'active' : ''}`}
        >
          Sources
        </a>
        <a
          onClick={nav.toAsk}
          className={`nav-link ${route.page === 'ask' ? 'active' : ''}`}
        >
          Ask AI
        </a>
        <div className="nav-spacer">
          {loggedIn ? (
            <span className="login-status">Logged in</span>
          ) : (
            <span className="login-controls">
              <input className="input-field login-input" placeholder="user" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} />
              <input className="input-field login-input" placeholder="pass" type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
              <button className="primary-button" onClick={login}>Login</button>
            </span>
          )}
        </div>
      </nav>

      {route.page === 'dashboard' && <Dashboard onNavigate={(p) => (p === 'ask' ? nav.toAsk() : nav.toExplorer())} />}

      {route.page === 'explorer' && <Explorer onSelect={nav.toDetail} />}

      {route.page === 'detail' && (
        <>
          <EntityDetail
            entityType={route.entityType}
            entityId={route.entityId}
            onSelect={nav.toDetail}
            onBack={nav.toExplorer}
          />
          <div className="actions-row">
            <button className="primary-button" onClick={() => nav.toGraph(route.entityType, route.entityId)}>
              View connections graph →
            </button>
          </div>
        </>
      )}

      {route.page === 'graph' && (
        <>
          <div className="top-action-row">
            <button className="ghost-button" onClick={() => nav.toDetail(route.entityType, route.entityId)}>
              ← Back to details
            </button>
          </div>
          <GraphView entityType={route.entityType} entityId={route.entityId} onSelect={nav.toGraph} />
        </>
      )}

      {route.page === 'fullGraph' && <GlobalGraph onSelect={nav.toDetail} />}

      {route.page === 'sources' && <Sources />}

      {route.page === 'ask' && <AskAI />}
    </div>
  );
}
