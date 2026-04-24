import { useState, useEffect } from 'react';
import { SourceFeedConfig } from './types';
import {
  clearFunctionsKey,
  createFeed,
  deleteFeed,
  hasBuildTimeFunctionsKey,
  listFeeds,
  loadSavedFunctionsKey,
  saveFunctionsKey,
  updateFeed,
} from './api/feedsApi';
import FeedList from './components/FeedList';
import FeedForm from './components/FeedForm';
import Settings from './components/Settings';
import './App.css';

type View = 'feeds' | 'settings';

interface LinkItem {
  label: string;
  href: string;
}

function App() {
  const [currentView, setCurrentView] = useState<View>('feeds');
  const [feeds, setFeeds] = useState<SourceFeedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adminKey, setAdminKey] = useState(() => loadSavedFunctionsKey());
  const [adminKeyMessage, setAdminKeyMessage] = useState<string | null>(null);

  const buildTimeAdminKey = hasBuildTimeFunctionsKey();
  const savedAdminKey = loadSavedFunctionsKey();
  const hasConfiguredAdminKey = buildTimeAdminKey || savedAdminKey.trim().length > 0;
  const functionsKey = adminKey.trim() || savedAdminKey.trim();
  const apiBase = new URL(import.meta.env.VITE_API_BASE || '/api', window.location.origin);
  const publicBase = new URL('../', window.location.href);
  const withCode = (url: URL) => {
    if (functionsKey) {
      url.searchParams.set('code', functionsKey);
    }

    return url.toString();
  };
  const publicLinks: LinkItem[] = [
    { label: 'Schedule-X Viewer', href: new URL('index.html', publicBase).toString() },
    { label: 'Status JSON', href: new URL('status.json', publicBase).toString() },
    { label: 'Schedule-X Full JSON', href: new URL('schedule-x-full.json', publicBase).toString() },
    { label: 'Schedule-X Games JSON', href: new URL('schedule-x-games.json', publicBase).toString() },
    { label: 'Merged Calendar ICS', href: new URL('calendar.ics', publicBase).toString() },
    { label: 'Games Calendar ICS', href: new URL('calendar-games.ics', publicBase).toString() },
  ];
  const apiLinks: LinkItem[] = [
    { label: 'Ping', href: new URL('ping', apiBase).toString() },
    { label: 'Status API', href: new URL('status', apiBase).toString() },
    { label: 'Settings API', href: new URL('settings', apiBase).toString() },
    { label: 'Feeds Simple', href: new URL('feeds-simple', apiBase).toString() },
    { label: 'Feeds API', href: withCode(new URL('feeds', apiBase)) },
    { label: 'Diagnostic API', href: withCode(new URL('diagnostic', apiBase)) },
  ];

  const loadFeeds = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedFeeds = await listFeeds();
      setFeeds(fetchedFeeds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feeds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasConfiguredAdminKey) {
      setFeeds([]);
      setLoading(false);
      return;
    }

    void loadFeeds();
  }, [hasConfiguredAdminKey]);

  const handleSaveAdminKey = () => {
    const trimmed = adminKey.trim();
    saveFunctionsKey(trimmed);
    setAdminKey(trimmed);
    setAdminKeyMessage(trimmed ? 'Admin key saved in this browser.' : 'Admin key cleared.');
    if (trimmed || buildTimeAdminKey) {
      void loadFeeds();
    }
  };

  const handleClearAdminKey = () => {
    clearFunctionsKey();
    setAdminKey('');
    setAdminKeyMessage('Admin key cleared.');
    if (!buildTimeAdminKey) {
      setFeeds([]);
      setLoading(false);
      setError(null);
      return;
    }

    void loadFeeds();
  };

  const handleCreate = async (feed: { name: string; url: string }) => {
    try {
      setError(null);
      await createFeed(feed);
      await loadFeeds();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feed');
    }
  };

  const handleUpdate = async (feedId: string, updates: { name?: string; url?: string }) => {
    try {
      setError(null);
      await updateFeed(feedId, updates);
      await loadFeeds();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feed');
    }
  };

  const handleDelete = async (feedId: string) => {
    if (!confirm('Are you sure you want to delete this feed?')) {
      return;
    }

    try {
      setError(null);
      await deleteFeed(feedId);
      await loadFeeds();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete feed');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Calendar Merge</h1>
        <p>Manage your calendar feed sources</p>

        <nav className="app-nav">
          <button
            className={`nav-button ${currentView === 'feeds' ? 'active' : ''}`}
            onClick={() => setCurrentView('feeds')}
          >
            Feeds
          </button>
          <button
            className={`nav-button ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            Settings
          </button>
        </nav>

        <div className="admin-key-panel">
          <label htmlFor="admin-key">Admin Function Key</label>
          <div className="admin-key-controls">
            <input
              id="admin-key"
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="Enter function key for write access"
              autoComplete="off"
            />
            <button className="btn-secondary" onClick={handleSaveAdminKey} type="button">
              Save Key
            </button>
            <button className="btn-secondary" onClick={handleClearAdminKey} type="button">
              Clear
            </button>
          </div>
          <p className="admin-key-help">
            Feed URLs, feed changes, and settings updates require a Function key.
            {hasConfiguredAdminKey
              ? ' Admin access is configured for this browser.'
              : ' Enter a key to load and manage feed URLs.'}
          </p>
          {buildTimeAdminKey && !adminKey && (
            <p className="admin-key-help">A build-configured key is currently available.</p>
          )}
          {adminKeyMessage && <p className="admin-key-status">{adminKeyMessage}</p>}
        </div>

        <div className="troubleshooting-panel">
          <div className="troubleshooting-section">
            <h2>Troubleshooting Links</h2>
            <p>
              Open the public artifacts and API endpoints directly while debugging refresh,
              rendering, or feed issues.
            </p>
          </div>

          <div className="troubleshooting-grid">
            <section className="troubleshooting-section">
              <h3>Public Outputs</h3>
              <div className="link-list">
                {publicLinks.map((link) => (
                  <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ))}
              </div>
            </section>

            <section className="troubleshooting-section">
              <h3>API Endpoints</h3>
              <div className="link-list">
                {apiLinks.map((link) => (
                  <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ))}
              </div>
              {!functionsKey && (
                <p className="admin-key-help">
                  Save a Function key above to make the protected API links usable.
                </p>
              )}
            </section>
          </div>
        </div>
      </header>

      <main className="app-main">
        {currentView === 'feeds' && (
          <>
            {error && (
              <div className="error-message">
                {error}
                <button onClick={() => setError(null)}>Dismiss</button>
              </div>
            )}

            <div className="actions">
              <button
                className="btn-primary"
                onClick={() => setShowForm(!showForm)}
                disabled={!hasConfiguredAdminKey}
              >
                {showForm ? 'Cancel' : 'Add New Feed'}
              </button>
            </div>

            {showForm && hasConfiguredAdminKey && (
              <FeedForm
                onSubmit={handleCreate}
                onCancel={() => setShowForm(false)}
              />
            )}

            {!hasConfiguredAdminKey ? (
              <div className="empty-state">
                <p>A Function key is required to load feed URLs.</p>
                <p>Save the admin key above, then the current feeds will appear here.</p>
              </div>
            ) : loading ? (
              <div className="loading">Loading feeds...</div>
            ) : (
              <FeedList
                feeds={feeds}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            )}
          </>
        )}

        {currentView === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
