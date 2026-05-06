import { useState, useEffect } from 'react';
import { SourceFeedConfig } from './types';
import {
  clearFunctionsKey,
  createFeed,
  deleteFeed,
  listFeeds,
  loadSavedFunctionsKey,
  saveFunctionsKey,
  updateFeed,
} from './api/feedsApi';
import ServiceHealthBanner from './components/ServiceHealthBanner';
import MobileMenu from './components/MobileMenu';
import { ToastProvider, Toast } from './components/ui/Toast';
import { TooltipProvider } from './components/ui/Tooltip';
import { useToast } from './hooks/useToast';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { useManualRefresh } from './hooks/useManualRefresh';
import Dashboard from './views/Dashboard';
import Changes from './views/Changes';
import Feeds from './views/Feeds';
import Settings from './components/Settings';
import { LayoutDashboard, Rss, Bell, Settings as SettingsIcon, Menu, HelpCircle } from 'lucide-react';
import { clsx } from 'clsx';
import './App.css';

type View = 'dashboard' | 'feeds' | 'changes' | 'settings';

interface LinkItem {
  label: string;
  href: string;
}

function toDirectoryUrl(path: string, origin: string): URL {
  const normalizedPath = path.endsWith('/') ? path : `${path}/`;
  return new URL(normalizedPath, origin);
}

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [feeds, setFeeds] = useState<SourceFeedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState(() => loadSavedFunctionsKey());
  const [adminKeyMessage, setAdminKeyMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const { toast, toasts, removeToast } = useToast();
  const { refresh: manualRefresh } = useManualRefresh();

  const savedAdminKey = loadSavedFunctionsKey();
  const hasConfiguredAdminKey = savedAdminKey.trim().length > 0;
  const apiBase = toDirectoryUrl(import.meta.env.VITE_API_BASE || '/api', window.location.origin);
  const publicBase = new URL('../', window.location.href);
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
    { label: 'Feeds API', href: new URL('feeds', apiBase).toString() },
    { label: 'Diagnostic API', href: new URL('diagnostic', apiBase).toString() },
  ];
  const manageBase = window.location.href;
  const apiBaseDisplay = apiBase.toString().replace(/\/$/, '');
  const publicBaseDisplay = publicBase.toString().replace(/\/$/, '');

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
    if (trimmed) {
      void loadFeeds();
    }
  };

  const handleClearAdminKey = () => {
    clearFunctionsKey();
    setAdminKey('');
    setAdminKeyMessage('Admin key cleared.');
    setFeeds([]);
    setLoading(false);
    setError(null);
  };

  const handleCreate = async (feed: { name: string; url: string }) => {
    try {
      setError(null);
      await createFeed(feed);
      await loadFeeds();
      toast.success('Feed created successfully', `${feed.name} has been added`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create feed';
      setError(errorMsg);
      toast.error('Failed to create feed', errorMsg);
    }
  };

  const handleUpdate = async (feedId: string, updates: { name?: string; url?: string; enabled?: boolean }) => {
    try {
      setError(null);
      await updateFeed(feedId, updates);
      await loadFeeds();

      if (updates.enabled !== undefined) {
        toast.success(
          updates.enabled ? 'Feed enabled' : 'Feed disabled',
          'Changes will take effect on next refresh'
        );
      } else {
        toast.success('Feed updated successfully');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update feed';
      setError(errorMsg);
      toast.error('Failed to update feed', errorMsg);
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
      toast.success('Feed deleted successfully');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete feed';
      setError(errorMsg);
      toast.error('Failed to delete feed', errorMsg);
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcut('cmd+r', () => {
    if (hasConfiguredAdminKey) {
      manualRefresh();
      toast.info('Manual refresh triggered');
    }
  }, [hasConfiguredAdminKey]);

  useKeyboardShortcut('cmd+k', () => {
    setCurrentView('feeds');
  }, []);

  useKeyboardShortcut('?', () => {
    setShowShortcuts(!showShortcuts);
  }, [showShortcuts]);

  return (
    <TooltipProvider>
      <ToastProvider>
        <div className="app">
          {/* Skip to main content (accessibility) */}
          <a href="#main-content" className="skip-to-main">
            Skip to main content
          </a>

          <ServiceHealthBanner />

          <header className="app-header">
            <div className="flex items-center justify-between">
              <div>
                <h1>Calendar Merge</h1>
                <p>Manage your calendar feed sources</p>
              </div>

              {/* Mobile menu button and shortcuts */}
              <div className="flex items-center gap-2 md:hidden">
                <button
                  onClick={() => setShowShortcuts(true)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Show keyboard shortcuts"
                >
                  <HelpCircle className="h-5 w-5 text-slate-600" />
                </button>
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Desktop navigation */}
            <nav className="app-nav hidden md:flex">
              <button
                className={clsx('nav-button', currentView === 'dashboard' && 'active')}
                onClick={() => setCurrentView('dashboard')}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>
              <button
                className={clsx('nav-button', currentView === 'feeds' && 'active')}
                onClick={() => setCurrentView('feeds')}
              >
                <Rss className="h-4 w-4" />
                Feeds
              </button>
              <button
                className={clsx('nav-button', currentView === 'changes' && 'active')}
                onClick={() => setCurrentView('changes')}
              >
                <Bell className="h-4 w-4" />
                Changes
              </button>
              <button
                className={clsx('nav-button', currentView === 'settings' && 'active')}
                onClick={() => setCurrentView('settings')}
              >
                <SettingsIcon className="h-4 w-4" />
                Settings
              </button>
              <button
                onClick={() => setShowShortcuts(true)}
                className="nav-button"
                title="Keyboard shortcuts (?)"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </nav>

            {/* Mobile menu */}
            <MobileMenu
              open={mobileMenuOpen}
              onClose={() => setMobileMenuOpen(false)}
              currentView={currentView}
              onViewChange={setCurrentView}
            />

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
          {adminKeyMessage && <p className="admin-key-status">{adminKeyMessage}</p>}
        </div>

        <div className="troubleshooting-panel">
          <div className="troubleshooting-section">
            <h2>Troubleshooting Links</h2>
            <p>
              Open the public artifacts and API endpoints directly while debugging refresh,
              rendering, or feed issues.
            </p>
            <p className="troubleshooting-note">
              Manage UI base: <a href={manageBase} target="_blank" rel="noreferrer">{manageBase}</a>
            </p>
            <p className="troubleshooting-note">
              Function API base: <a href={apiBaseDisplay} target="_blank" rel="noreferrer">{apiBaseDisplay}</a>
            </p>
            <p className="troubleshooting-note">
              Public site base: <a href={publicBaseDisplay} target="_blank" rel="noreferrer">{publicBaseDisplay}</a>
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
              {!hasConfiguredAdminKey && (
                <p className="admin-key-help">
                  Protected endpoints require clients to send the Function key in the x-functions-key header.
                </p>
              )}
            </section>
          </div>
        </div>
      </header>

      <main id="main-content" className="app-main" role="main">
        {currentView === 'dashboard' && <Dashboard />}

        {currentView === 'feeds' && (
          <Feeds
            feeds={feeds}
            loading={loading}
            error={error}
            hasConfiguredAdminKey={hasConfiguredAdminKey}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onCreate={handleCreate}
            setError={setError}
          />
        )}

        {currentView === 'changes' && <Changes />}

        {currentView === 'settings' && <Settings />}
      </main>

      {/* Toast notifications */}
      {toasts.map(toastItem => (
        <Toast
          key={toastItem.id}
          title={toastItem.title}
          description={toastItem.description}
          variant={toastItem.variant}
          duration={toastItem.duration}
          onOpenChange={(open) => !open && removeToast(toastItem.id)}
        />
      ))}

      {/* Keyboard shortcuts help */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Keyboard Shortcuts</h3>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Manual Refresh</span>
                <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">
                  ⌘ R
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Go to Feeds</span>
                <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">
                  ⌘ K
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Show Shortcuts</span>
                <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">
                  ?
                </kbd>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              ⌘ on Mac, Ctrl on Windows/Linux
            </p>
          </div>
        </div>
      )}
    </div>
  </ToastProvider>
</TooltipProvider>
  );
}

export default App;
