import { useState } from 'react';

import { normalizeFeedUrl, validateFeedUrl } from '../lib/feedInput';
import Button from './ui/Button';
import { Loader2 } from 'lucide-react';

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

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setUrlError(validateFeedUrl(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !url.trim()) {
      return;
    }

    // Final validation before submit
    const error = validateFeedUrl(url);
    if (error) {
      setUrlError(error);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), url: normalizeFeedUrl(url) });
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
          <div className="text-sm text-red-600 mt-2">
            {urlError}
          </div>
        )}
        <div className="text-xs text-slate-500 mt-2">
          Accepts direct calendar subscription URLs, including tokenized provider links and webcal:// links, which are converted to https://.
        </div>
      </div>

      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            initialValues ? 'Update Feed' : 'Add Feed'
          )}
        </Button>
        <Button variant="secondary" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default FeedForm;
