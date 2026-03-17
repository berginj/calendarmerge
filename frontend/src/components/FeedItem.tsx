import { useState } from 'react';
import { SourceFeedConfig } from '../types';
import FeedForm from './FeedForm';

interface FeedItemProps {
  feed: SourceFeedConfig;
  onUpdate: (feedId: string, updates: { name?: string; url?: string }) => Promise<void>;
  onDelete: (feedId: string) => Promise<void>;
}

function FeedItem({ feed, onUpdate, onDelete }: FeedItemProps) {
  const [editing, setEditing] = useState(false);

  const handleUpdate = async (updates: { name: string; url: string }) => {
    await onUpdate(feed.id, updates);
    setEditing(false);
  };

  const handleDelete = async () => {
    await onDelete(feed.id);
  };

  if (editing) {
    return (
      <div className="feed-item feed-item-editing">
        <FeedForm
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
          initialValues={{ name: feed.name, url: feed.url }}
        />
      </div>
    );
  }

  return (
    <div className="feed-item">
      <div className="feed-info">
        <h3>{feed.name}</h3>
        <p className="feed-url">{feed.url}</p>
        <p className="feed-id">ID: {feed.id}</p>
      </div>
      <div className="feed-actions">
        <button
          className="btn-secondary"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
        <button
          className="btn-danger"
          onClick={handleDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default FeedItem;
