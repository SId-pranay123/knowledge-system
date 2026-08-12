import { useState } from 'react';
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
  | { page: 'ask' }
  | { page: 'sources' };

export default function App() {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  async function login() {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUser, password: loginPass }),
    });
    if (res.ok) {
      const data = await res.json();
      setToken(data.accessToken);
      setLoggedIn(true);
    } else {
      alert('Login failed');
    }
  }

  const nav = {
    toDashboard: () => setRoute({ page: 'dashboard' }),
    toExplorer: () => setRoute({ page: 'explorer' }),
    toDetail: (entityType: string, entityId: string) => setRoute({ page: 'detail', entityType, entityId }),
    toGraph: (entityType: string, entityId: string) => setRoute({ page: 'graph', entityType, entityId }),
    toFullGraph: () => setRoute({ page: 'fullGraph' }),
    toAsk: () => setRoute({ page: 'ask' }),
    toSources: () => setRoute({ page: 'sources' }),
  };

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <a onClick={nav.toDashboard} className={'nav-link ' + (route.page === 'dashboard' ? 'active' : '')}>
          Dashboard
        </a>
        <a onClick={nav.toExplorer} className={'nav-link ' + (route.page === 'explorer' ? 'active' : '')}>
          Explorer
        </a>
        <a onClick={nav.toFullGraph} className={'nav-link ' + (route.page === 'fullGraph' ? 'active' : '')}>
          Full Graph
        </a>
        <a onClick={nav.toAsk} className={'nav-link ' + (route.page === 'ask' ? 'active' : '')}>
          Ask AI
        </a>
        <a onClick={nav.toSources} className={'nav-link ' + (route.page === 'sources' ? 'active' : '')}>
          Sources
        </a>

        <div className="nav-spacer">
          {loggedIn ? (
            <span className="login-status">Logged in</span>
          ) : (
            <span className="login-controls">
              <input
                className="input-field login-input"
                placeholder="user"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
              />
              <input
                className="input-field login-input"
                placeholder="pass"
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
              />
              <button className="primary-button" onClick={login}>
                Login
              </button>
            </span>
          )}
        </div>
      </nav>

      {route.page === 'dashboard' && (
        <Dashboard onNavigate={(p) => (p === 'ask' ? nav.toAsk() : nav.toExplorer())} />
      )}

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

      {route.page === 'ask' && <AskAI />}

      {route.page === 'sources' && <Sources />}
    </div>
  );
}