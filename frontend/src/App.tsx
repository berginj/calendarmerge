import { useState, useEffect } from 'react';
import { SourceFeedConfig } from './types';
import { listFeeds, createFeed, updateFeed, deleteFeed } from './api/feedsApi';
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
