import { useState, useEffect } from 'react';
import { AppSettings, getSettings, updateSettings } from '../api/feedsApi';

function toDirectoryUrl(path: string, origin: string): URL {
  const normalizedPath = path.endsWith('/') ? path : `${path}/`;
  return new URL(normalizedPath, origin);
}

function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const apiBase = toDirectoryUrl('/api', window.location.origin);
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

  const scheduleOptions: Array<{
    value: AppSettings['refreshSchedule'];
    label: string;
    description: string;
  }> = [
    {
      value: 'every-15-min',
      label: 'Every 15 Minutes',
      description: 'Most responsive - calendars update quickly (default)',
    },
    {
      value: 'hourly',
      label: 'Every Hour',
      description: 'Balanced - updates every hour, all day',
    },
    {
      value: 'every-2-hours',
      label: 'Every 2 Hours',
      description: 'Less frequent - updates every 2 hours',
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

      <div className="settings-info">
        <h4>About Refresh Schedules</h4>
        <ul>
          <li>
            <strong>Every 15 Minutes (Recommended):</strong> Best for frequently changing
            calendars like school or sports schedules. Near real-time updates.
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
