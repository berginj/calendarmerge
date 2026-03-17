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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !url.trim()) {
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
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/calendar.ics"
          required
          disabled={submitting}
        />
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
