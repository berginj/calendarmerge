export interface SourceFeedConfig {
  id: string;
  name: string;
  url: string;
  enabled?: boolean;
}

export interface NewSourceFeedInput {
  name: string;
  url: string;
}

export interface FeedCreateFailure {
  feed: NewSourceFeedInput;
  error: string;
}

export interface BulkFeedCreateResult {
  created: SourceFeedConfig[];
  failed: FeedCreateFailure[];
}
