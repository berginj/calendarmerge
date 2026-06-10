import { useState, useEffect } from 'react';
import {
  AppSettings,
  GameFilterPreview,
  GameFilterRules,
  getSettings,
  previewGameFilter,
  updateSettings,
} from '../api/feedsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import Button from './ui/Button';
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';

interface LinkItem {
  label: string;
  href: string;
}

export interface SettingsProps {
  publicLinks: LinkItem[];
  apiLinks: LinkItem[];
  manageBase: string;
  apiBaseDisplay: string;
  publicBaseDisplay: string;
  hasAdminSession: boolean;
  toast: {
    success: (title: string, description?: string) => string;
    error: (title: string, description?: string) => string;
    warning: (title: string, description?: string) => string;
    info: (title: string, description?: string) => string;
  };
}

function Settings({ publicLinks, apiLinks, manageBase, apiBaseDisplay, publicBaseDisplay, hasAdminSession, toast }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [gameFilterDraft, setGameFilterDraft] = useState<GameFilterRules | null>(null);
  const [gameFilterPreview, setGameFilterPreview] = useState<GameFilterPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedSettings = await getSettings();
      setSettings(fetchedSettings);
      setGameFilterDraft(fetchedSettings.gameFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleChange = async (schedule: AppSettings['refreshSchedule']) => {
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);

      const updated = await updateSettings({ refreshSchedule: schedule });
      setSettings(updated);
      toast.success('Settings saved', 'Refresh schedule updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleGameFilterChange = (field: keyof GameFilterRules, value: string) => {
    if (!gameFilterDraft) return;

    setGameFilterDraft({
      ...gameFilterDraft,
      [field]: linesToList(value),
    });
    setGameFilterPreview(null);
  };

  const handleSaveGameFilter = async () => {
    if (!gameFilterDraft) return;

    try {
      setSaving(true);
      setError(null);

      const updated = await updateSettings({ gameFilter: gameFilterDraft });
      setSettings(updated);
      setGameFilterDraft(updated.gameFilter);
      toast.success('Game filter saved', 'Rules will take effect on next refresh.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game filter rules');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewGameFilter = async () => {
    if (!gameFilterDraft) return;

    try {
      setPreviewing(true);
      setError(null);
      setGameFilterPreview(await previewGameFilter(gameFilterDraft));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview game filter rules');
    } finally {
      setPreviewing(false);
    }
  };

  const scheduleOptions: Array<{
    value: AppSettings['refreshSchedule'];
    label: string;
    description: string;
  }> = [
    {
      value: 'every-4-hours',
      label: 'Every 4 Hours',
      description: 'Default release cadence for family and team calendars',
    },
    {
      value: 'hourly',
      label: 'Every Hour',
      description: 'More responsive, higher provider traffic',
    },
    {
      value: 'every-2-hours',
      label: 'Every 2 Hours',
      description: 'Moderate provider traffic',
    },
    {
      value: 'every-15-min',
      label: 'Every 15 Minutes',
      description: 'High-frequency option for short periods',
    },
    {
      value: 'business-hours',
      label: 'Business Hours Only',
      description: 'Hourly updates 8 AM - 6 PM EST, Mon-Fri only',
    },
    {
      value: 'manual-only',
      label: 'Manual Only',
      description: 'Automatic updates disabled - refresh manually',
    },
  ];
  const gameFilterFields: Array<{
    field: keyof GameFilterRules;
    label: string;
    rows: number;
  }> = [
    { field: 'forceIncludeFeedIds', label: 'Always Include Feed IDs', rows: 3 },
    { field: 'forceExcludeFeedIds', label: 'Always Exclude Feed IDs', rows: 3 },
    { field: 'includeKeywords', label: 'Include Keywords', rows: 4 },
    { field: 'excludeKeywords', label: 'Exclude Keywords', rows: 3 },
    { field: 'includeRegex', label: 'Include Regex', rows: 4 },
    { field: 'excludeRegex', label: 'Exclude Regex', rows: 3 },
    { field: 'teamAliases', label: 'Team Aliases', rows: 3 },
  ];

  if (loading) {
    return (
      <div className="settings-container">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="settings-container">
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">Failed to load settings</p>
              <Button variant="secondary" onClick={loadSettings}>Retry</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <h2 className="text-xl font-semibold text-primary-700 mb-4">Settings</h2>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Refresh Schedule</CardTitle>
          <CardDescription>Choose how often your calendar feeds are checked for updates.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="schedule-options">
            {scheduleOptions.map((option) => (
              <label
                key={option.value}
                className={`schedule-option ${settings.refreshSchedule === option.value ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="refreshSchedule"
                  value={option.value}
                  checked={settings.refreshSchedule === option.value}
                  onChange={() => handleScheduleChange(option.value)}
                  disabled={saving}
                />
                <div className="option-content">
                  <div className="option-label">{option.label}</div>
                  <div className="option-description">{option.description}</div>
                </div>
              </label>
            ))}
          </div>

          {settings.lastUpdated && (
            <p className="last-updated">
              Last updated: {new Date(settings.lastUpdated).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {gameFilterDraft && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Games-Only Rules</CardTitle>
            <CardDescription>Configure which events appear in the games-only calendar.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="game-filter-grid">
              {gameFilterFields.map((field) => (
                <label key={field.field} className="game-filter-field">
                  <span>{field.label}</span>
                  <textarea
                    value={listToLines(gameFilterDraft[field.field])}
                    onChange={(event) => handleGameFilterChange(field.field, event.target.value)}
                    rows={field.rows}
                    disabled={saving || previewing}
                  />
                </label>
              ))}
            </div>

            <div className="settings-actions">
              <Button variant="secondary" type="button" onClick={handlePreviewGameFilter} disabled={saving || previewing}>
                {previewing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Previewing…
                  </>
                ) : (
                  'Preview Matches'
                )}
              </Button>
              <Button variant="primary" type="button" onClick={handleSaveGameFilter} disabled={saving || previewing}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Rules'
                )}
              </Button>
            </div>

            {gameFilterPreview && (
              <div className="game-filter-preview">
                <div>
                  <strong>{gameFilterPreview.matchedGameCount}</strong>
                  <span>Matched games</span>
                </div>
                <div>
                  <strong>{gameFilterPreview.excludedEventCount}</strong>
                  <span>Excluded events</span>
                </div>
                <div>
                  <strong>{gameFilterPreview.failedFeedCount}</strong>
                  <span>Failed feeds</span>
                </div>
                {gameFilterPreview.matchedSamples.length > 0 && (
                  <div className="game-filter-samples">
                    <span>Matched samples</span>
                    <ul>
                      {gameFilterPreview.matchedSamples.slice(0, 5).map((event) => (
                        <li key={`${event.sourceName}-${event.start}-${event.title}`}>
                          {event.title} - {event.sourceName}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Troubleshooting — collapsible */}
      <Card className="mb-6">
        <CardContent className="py-0">
          <button
            onClick={() => setShowTroubleshooting(!showTroubleshooting)}
            className="flex items-center justify-between w-full py-4 text-left"
            aria-expanded={showTroubleshooting}
          >
            <div>
              <h3 className="text-base font-semibold text-slate-900">Troubleshooting & Endpoints</h3>
              <p className="text-sm text-slate-500 mt-0.5">Public outputs, API endpoints, and debug links</p>
            </div>
            {showTroubleshooting ? (
              <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
            )}
          </button>

          {showTroubleshooting && (
            <div className="pb-4 border-t border-slate-100 pt-4">
              <div className="text-sm text-slate-500 space-y-1 mb-4">
                <p>Manage UI: <a href={manageBase} target="_blank" rel="noreferrer" className="text-primary-700 hover:underline">{manageBase}</a></p>
                <p>API base: <a href={apiBaseDisplay} target="_blank" rel="noreferrer" className="text-primary-700 hover:underline">{apiBaseDisplay}</a></p>
                <p>Public site: <a href={publicBaseDisplay} target="_blank" rel="noreferrer" className="text-primary-700 hover:underline">{publicBaseDisplay}</a></p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Public Outputs</h4>
                  <div className="space-y-1.5">
                    {publicLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">API Endpoints</h4>
                  <div className="space-y-1.5">
                    {apiLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                  {!hasAdminSession && (
                    <p className="text-xs text-slate-500 mt-2">
                      Protected endpoints require an admin session.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About Refresh Schedules</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 list-none p-0">
            <li className="text-sm text-slate-600">
              <strong className="text-slate-900">Every 4 Hours:</strong> Default cadence for normal family and team calendar updates.
            </li>
            <li className="text-sm text-slate-600">
              <strong className="text-slate-900">Hourly:</strong> Good balance between responsiveness and efficiency. Updates once per hour, 24/7.
            </li>
            <li className="text-sm text-slate-600">
              <strong className="text-slate-900">Every 2 Hours:</strong> Less frequent checks. Suitable for calendars that don't change often.
            </li>
            <li className="text-sm text-slate-600">
              <strong className="text-slate-900">Business Hours Only:</strong> Updates only during weekday work hours (8 AM - 6 PM EST, Monday-Friday).
            </li>
            <li className="text-sm text-slate-600">
              <strong className="text-slate-900">Manual Only:</strong> Automatic updates are disabled. Trigger refreshes manually.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default Settings;

function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(value: string[]): string {
  return value.join('\n');
}
