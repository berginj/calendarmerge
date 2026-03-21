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

function App() {
  const [currentView, setCurrentView] = useState<View>('feeds');
  const [feeds, setFeeds] = useState<SourceFeedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adminKey, setAdminKey] = useState(() => loadSavedFunctionsKey());
  const [adminKeyMessage, setAdminKeyMessage] = useState<string | null>(null);

  const buildTimeAdminKey = hasBuildTimeFunctionsKey();
  const hasConfiguredAdminKey = buildTimeAdminKey || adminKey.trim().length > 0;

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
    loadFeeds();
  }, []);

  const handleSaveAdminKey = () => {
    const trimmed = adminKey.trim();
    saveFunctionsKey(trimmed);
    setAdminKey(trimmed);
    setAdminKeyMessage(trimmed ? 'Admin key saved in this browser.' : 'Admin key cleared.');
  };

  const handleClearAdminKey = () => {
    clearFunctionsKey();
    setAdminKey('');
    setAdminKeyMessage('Admin key cleared.');
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
            Feed changes and settings updates require a Function key.
            {hasConfiguredAdminKey
              ? ' Write access is configured for this browser.'
              : ' Read-only mode is active until a key is saved.'}
          </p>
          {buildTimeAdminKey && !adminKey && (
            <p className="admin-key-help">A build-configured key is currently available.</p>
          )}
          {adminKeyMessage && <p className="admin-key-status">{adminKeyMessage}</p>}
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
              >
                {showForm ? 'Cancel' : 'Add New Feed'}
              </button>
            </div>

            {showForm && (
              <FeedForm
                onSubmit={handleCreate}
                onCancel={() => setShowForm(false)}
              />
            )}

            {loading ? (
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
