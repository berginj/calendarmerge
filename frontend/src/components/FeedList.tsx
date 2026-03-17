import { SourceFeedConfig } from '../types';
import FeedItem from './FeedItem';

interface FeedListProps {
  feeds: SourceFeedConfig[];
  onUpdate: (feedId: string, updates: { name?: string; url?: string }) => Promise<void>;
  onDelete: (feedId: string) => Promise<void>;
}

function FeedList({ feeds, onUpdate, onDelete }: FeedListProps) {
  if (feeds.length === 0) {
    return (
      <div className="empty-state">
        <p>No calendar feeds configured yet.</p>
        <p>Click "Add New Feed" to get started.</p>
      </div>
    );
  }

  return (
    <div className="feed-list">
      {feeds.map((feed) => (
        <FeedItem
          key={feed.id}
          feed={feed}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export default FeedList;
