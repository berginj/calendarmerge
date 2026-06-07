import { useState, useEffect } from 'react';
import {
  AppSettings,
  GameFilterPreview,
  GameFilterRules,
  getSettings,
  previewGameFilter,
  updateSettings,
} from '../api/feedsApi';

function toDirectoryUrl(path: string, origin: string): URL {
  const normalizedPath = path.endsWith('/') ? path : `${path}/`;
  return new URL(normalizedPath, origin);
}

function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [gameFilterDraft, setGameFilterDraft] = useState<GameFilterRules | null>(null);
  const [gameFilterPreview, setGameFilterPreview] = useState<GameFilterPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const apiBase = toDirectoryUrl(import.meta.env.VITE_API_BASE || '/api', window.location.origin);
  const publicBase = new URL('../', window.location.href);
  const apiBaseDisplay = apiBase.toString().replace(/\/$/, '');
  const publicBaseDisplay = publicBase.toString().replace(/\/$/, '');

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
      setSuccessMessage(null);

      const updated = await updateSettings({ refreshSchedule: schedule });
      setSettings(updated);
      setSuccessMessage('Settings saved successfully!');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
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
      setSuccessMessage(null);

      const updated = await updateSettings({ gameFilter: gameFilterDraft });
      setSettings(updated);
      setGameFilterDraft(updated.gameFilter);
      setSuccessMessage('Game filter rules saved.');
      setTimeout(() => setSuccessMessage(null), 3000);
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
        <div className="loading">Loading settings...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="settings-container">
        <div className="error-message">
          Failed to load settings
          <button onClick={loadSettings}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <h2>Settings</h2>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="success-message">
          {successMessage}
        </div>
      )}

      <div className="settings-section">
        <h3>Refresh Schedule</h3>
        <p className="settings-description">
          Choose how often your calendar feeds are checked for updates.
        </p>

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
      </div>

      <div className="settings-section">
        <h3>Endpoint Reference</h3>
        <p className="settings-description">
          Use the Function App URLs with the <code>/api/</code> prefix. The public viewer and
          published artifacts live on the storage static site, not on the Function App host.
        </p>
        <div className="settings-links">
          <a href={apiBaseDisplay} target="_blank" rel="noreferrer">{apiBaseDisplay}</a>
          <a href={new URL('status', apiBase).toString()} target="_blank" rel="noreferrer">{new URL('status', apiBase).toString()}</a>
          <a href={new URL('status/internal', apiBase).toString()} target="_blank" rel="noreferrer">{new URL('status/internal', apiBase).toString()}</a>
          <a href={new URL('settings', apiBase).toString()} target="_blank" rel="noreferrer">{new URL('settings', apiBase).toString()}</a>
          <a href={publicBaseDisplay} target="_blank" rel="noreferrer">{publicBaseDisplay}</a>
          <a href={new URL('index.html', publicBase).toString()} target="_blank" rel="noreferrer">{new URL('index.html', publicBase).toString()}</a>
          <a href={new URL('status.json', publicBase).toString()} target="_blank" rel="noreferrer">{new URL('status.json', publicBase).toString()}</a>
        </div>
      </div>

      {gameFilterDraft && (
        <div className="settings-section">
          <h3>Games-Only Rules</h3>
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
            <button className="btn-secondary" type="button" onClick={handlePreviewGameFilter} disabled={saving || previewing}>
              {previewing ? 'Previewing...' : 'Preview Matches'}
            </button>
            <button className="btn-primary" type="button" onClick={handleSaveGameFilter} disabled={saving || previewing}>
              {saving ? 'Saving...' : 'Save Rules'}
            </button>
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
        </div>
      )}

      <div className="settings-info">
        <h4>About Refresh Schedules</h4>
        <ul>
          <li>
            <strong>Every 4 Hours:</strong> Default cadence for normal family and team calendar updates.
          </li>
          <li>
            <strong>Hourly:</strong> Good balance between responsiveness and efficiency.
            Updates once per hour, 24/7.
          </li>
          <li>
            <strong>Every 2 Hours:</strong> Less frequent checks. Suitable for calendars that
            don't change often.
          </li>
          <li>
            <strong>Business Hours Only:</strong> Updates only during weekday work hours (8 AM - 6 PM EST, Monday-Friday).
            No weekend or evening updates.
          </li>
          <li>
            <strong>Manual Only:</strong> Automatic updates are disabled. You'll need to trigger
            refreshes manually from the API.
          </li>
        </ul>
      </div>
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
