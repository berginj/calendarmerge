import { useState } from 'react';

interface FeedFormProps {
  onSubmit: (feed: { name: string; url: string }) => Promise<void>;
  onCancel: () => void;
  initialValues?: { name: string; url: string };
}

function FeedForm({ onSubmit, onCancel, initialValues }: FeedFormProps) {
  const [name, setName] = useState(initialValues?.name || '');
  const [url, setUrl] = useState(initialValues?.url || '');
  const [submitting, setSubmitting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const validateUrl = (urlValue: string): string | null => {
    const trimmed = urlValue.trim();

    // Check for webcal:// and suggest https://
    if (trimmed.startsWith('webcal://')) {
      return 'Replace "webcal://" with "https://" in the URL';
    }

    // Check for Google Calendar web UI URLs (common mistake)
    if (trimmed.includes('calendar.google.com/calendar/u/') || trimmed.includes('?cid=')) {
      return 'This looks like a Google Calendar web URL. You need the ICS feed URL instead. Go to calendar settings → "Integrate calendar" → copy the "Secret address in iCal format"';
    }

    // Check if it ends with .ics
    if (!trimmed.endsWith('.ics')) {
      return 'URL should end with .ics (calendar feed format)';
    }

    // Basic URL validation
    try {
      new URL(trimmed);
    } catch {
      return 'Please enter a valid URL starting with https://';
    }

    return null;
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setUrlError(validateUrl(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !url.trim()) {
      return;
    }

    // Final validation before submit
    const error = validateUrl(url);
    if (error) {
      setUrlError(error);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), url: url.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="feed-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="name">Feed Name</label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., School Calendar"
          required
          disabled={submitting}
        />
      </div>

      <div className="form-group">
        <label htmlFor="url">ICS Feed URL</label>
        <input
          type="url"
          id="url"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://example.com/calendar.ics"
          required
          disabled={submitting}
        />
        {urlError && (
          <div style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {urlError}
          </div>
        )}
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
          Must be an ICS calendar feed URL (ends with .ics)
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving...' : initialValues ? 'Update Feed' : 'Add Feed'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default FeedForm;
