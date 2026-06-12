import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BulkFeedCreateResult, NewSourceFeedInput, SourceFeedConfig } from './types';
import {
  createFeed,
  deleteFeed,
  getAdminSession,
  listFeeds,
  loginAdminSession,
  logoutAdminSession,
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
import Insights from './views/Insights';
import Settings from './components/Settings';
import Button from './components/ui/Button';
import { LayoutDashboard, Rss, Bell, Settings as SettingsIcon, Menu, HelpCircle, Search, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import './App.css';

type View = 'dashboard' | 'feeds' | 'insights' | 'changes' | 'settings';

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
  const [adminAccessCode, setAdminAccessCode] = useState('');
  const [hasAdminSession, setHasAdminSession] = useState(false);
  const [adminKeyMessage, setAdminKeyMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const queryClient = useQueryClient();
  const { toast, toasts, removeToast } = useToast();
  const { refresh: manualRefresh } = useManualRefresh();
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
    { label: 'Admin Status API', href: new URL('status/internal', apiBase).toString() },
    { label: 'Settings API', href: new URL('settings', apiBase).toString() },
    { label: 'Feeds API', href: new URL('feeds', apiBase).toString() },
    { label: 'Diagnostic API', href: new URL('diagnostic', apiBase).toString() },
  ];
  const manageBase = window.location.href;
  const apiBaseDisplay = apiBase.toString().replace(/\/$/, '');
  const publicBaseDisplay = publicBase.toString().replace(/\/$/, '');

  const scrollToMainContent = () => {
    window.setTimeout(() => {
      document.getElementById('main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const handleViewChange = (view: View) => {
    setCurrentView(view);
    scrollToMainContent();
  };

  const loadFeeds = async () => {
    if (!hasAdminSession) {
      setFeeds([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fetchedFeeds = await listFeeds();
      setFeeds(fetchedFeeds);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load feeds';
      setError(errorMessage);
      if (errorMessage.toLowerCase().includes('session')) {
        setHasAdminSession(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void getAdminSession()
      .then((session) => {
        setHasAdminSession(session.authenticated);
        setLoading(!session.authenticated);
      })
      .catch(() => {
        setHasAdminSession(false);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void loadFeeds();
  }, [hasAdminSession]);

  const handleSaveAdminKey = () => {
    const trimmed = adminAccessCode.trim();
    if (!trimmed) {
      setAdminKeyMessage('Enter an admin access code to sign in.');
      return;
    }

    setSigningIn(true);
    setAdminKeyMessage(null);
    void loginAdminSession(trimmed)
      .then(async () => {
        setHasAdminSession(true);
        setCurrentView('feeds');
        setAdminAccessCode('');
        setAdminKeyMessage('Admin session started.');
        void queryClient.invalidateQueries({ queryKey: ['serviceStatus'] });
        try {
          setLoading(true);
          setError(null);
          setFeeds(await listFeeds());
        } finally {
          setLoading(false);
        }
        scrollToMainContent();
      })
      .catch((err) => {
        const errorMsg = err instanceof Error ? err.message : 'Failed to start admin session';
        setAdminKeyMessage(errorMsg);
        setHasAdminSession(false);
      })
      .finally(() => {
        setSigningIn(false);
      });
  };

  const handleClearAdminKey = () => {
    void logoutAdminSession()
      .finally(() => {
        setHasAdminSession(false);
        setAdminAccessCode('');
        setAdminKeyMessage('Admin session cleared.');
        setFeeds([]);
        setLoading(false);
        setError(null);
        void queryClient.invalidateQueries({ queryKey: ['serviceStatus'] });
      });
  };

  const handleCreateMany = async (newFeeds: NewSourceFeedInput[]): Promise<BulkFeedCreateResult> => {
    const created: SourceFeedConfig[] = [];
    const failed: BulkFeedCreateResult['failed'] = [];

    try {
      setError(null);

      for (const feed of newFeeds) {
        try {
          const createdFeed = await createFeed(feed);
          created.push(createdFeed);
        } catch (err) {
          failed.push({
            feed,
            error: err instanceof Error ? err.message : 'Failed to create feed',
          });
        }
      }

      await loadFeeds();

      if (failed.length === 0) {
        toast.success(
          newFeeds.length === 1 ? 'Feed created successfully' : `${created.length} feeds created successfully`,
          newFeeds.length === 1 ? `${newFeeds[0].name} has been added` : 'New calendars will be included on the next refresh',
        );
      } else if (created.length > 0) {
        const message = `${created.length} added; ${failed.length} failed. Review the setup panel for details.`;
        setError(message);
        toast.warning('Some feeds were not created', message);
      } else {
        const message = failed[0]?.error ?? 'Failed to create feeds';
        setError(message);
        toast.error('Failed to create feeds', message);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create feeds';
      setError(errorMsg);
      toast.error('Failed to create feeds', errorMsg);
    }

    return { created, failed };
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
    try {
      setError(null);
      await deleteFeed(feedId);
      await loadFeeds();
      toast.success('Feed disabled for 15 days');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete feed';
      setError(errorMsg);
      toast.error('Failed to delete feed', errorMsg);
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcut('cmd+r', () => {
    if (hasAdminSession) {
      manualRefresh();
      toast.info('Manual refresh triggered');
    }
  }, [hasAdminSession]);

  useKeyboardShortcut('cmd+k', () => {
    handleViewChange('feeds');
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
                onClick={() => handleViewChange('dashboard')}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>
              <button
                className={clsx('nav-button', currentView === 'feeds' && 'active')}
                onClick={() => handleViewChange('feeds')}
              >
                <Rss className="h-4 w-4" />
                Feeds
              </button>
              <button
                className={clsx('nav-button', currentView === 'insights' && 'active')}
                onClick={() => handleViewChange('insights')}
              >
                <Search className="h-4 w-4" />
                Insights
              </button>
              <button
                className={clsx('nav-button', currentView === 'changes' && 'active')}
                onClick={() => handleViewChange('changes')}
              >
                <Bell className="h-4 w-4" />
                Changes
              </button>
              <button
                className={clsx('nav-button', currentView === 'settings' && 'active')}
                onClick={() => handleViewChange('settings')}
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
              onViewChange={handleViewChange}
            />

            <div className="admin-key-panel">
              {hasAdminSession ? (
                <div className="admin-session-summary">
                  <div>
                    <span className="admin-session-title">
                      <span className="admin-session-dot" />
                      Admin session active
                    </span>
                    <p className="admin-key-help">Protected feed, settings, and refresh actions are available.</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleClearAdminKey} type="button">
                    Sign Out
                  </Button>
                </div>
              ) : (
                <>
                  <label htmlFor="admin-key">Admin Access Code</label>
                  <div className="admin-key-controls">
                    <input
                      id="admin-key"
                      type="password"
                      value={adminAccessCode}
                      onChange={(event) => setAdminAccessCode(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleSaveAdminKey();
                        }
                      }}
                      placeholder="Enter admin access code"
                      autoComplete="off"
                      disabled={signingIn}
                    />
                    <Button variant="secondary" size="sm" onClick={handleSaveAdminKey} type="button" disabled={signingIn}>
                      {signingIn ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Signing in…
                        </>
                      ) : (
                        'Sign In'
                      )}
                    </Button>
                  </div>
                  <p className="admin-key-help">
                    Feed URLs, feed changes, and settings updates require an authenticated admin session.
                    Enter your admin access code to load and manage feeds.
                  </p>
                </>
              )}
              {adminKeyMessage && <p className="admin-key-status">{adminKeyMessage}</p>}
            </div>
          </header>

          <main id="main-content" className="app-main" role="main">
            {currentView === 'dashboard' && <Dashboard />}

            {currentView === 'feeds' && (
              <Feeds
                feeds={feeds}
                loading={loading}
                error={error}
                hasAdminSession={hasAdminSession}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onCreateMany={handleCreateMany}
                setError={setError}
                toast={toast}
              />
            )}

            {currentView === 'insights' && <Insights />}

            {currentView === 'changes' && <Changes />}

            {currentView === 'settings' && (
              <Settings
                publicLinks={publicLinks}
                apiLinks={apiLinks}
                manageBase={manageBase}
                apiBaseDisplay={apiBaseDisplay}
                publicBaseDisplay={publicBaseDisplay}
                hasAdminSession={hasAdminSession}
                toast={toast}
              />
            )}
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
