export interface ParsedFeedInput {
  name: string;
  url: string;
}

export interface BulkFeedParseError {
  lineNumber: number;
  line: string;
  message: string;
}

export interface BulkFeedParseResult {
  feeds: ParsedFeedInput[];
  errors: BulkFeedParseError[];
}

const URL_PATTERN = /(webcals?:\/\/\S+|https?:\/\/\S+)/i;

export function normalizeFeedUrl(urlValue: string): string {
  return urlValue.trim().replace(/^webcals?:\/\//i, 'https://');
}

export function validateFeedUrl(urlValue: string): string | null {
  const trimmed = normalizeFeedUrl(urlValue);

  if (!trimmed) {
    return 'Please enter a calendar feed URL.';
  }

  if (trimmed.includes('calendar.google.com/calendar/u/') || trimmed.includes('?cid=')) {
    return 'This looks like a Google Calendar web URL. Use Settings > Integrate calendar > Secret address in iCal format instead.';
  }

  try {
    const parsed = new URL(trimmed);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'Please enter a valid URL starting with https:// or webcal://';
    }
  } catch {
    return 'Please enter a valid URL starting with https:// or webcal://';
  }

  return null;
}

export function parseBulkFeedInput(value: string): BulkFeedParseResult {
  const feeds: ParsedFeedInput[] = [];
  const errors: BulkFeedParseError[] = [];

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();

    if (!line) {
      return;
    }

    const urlMatch = line.match(URL_PATTERN);
    if (!urlMatch || urlMatch.index === undefined) {
      errors.push({
        lineNumber,
        line,
        message: 'Add one calendar subscription URL on this line.',
      });
      return;
    }

    const url = normalizeFeedUrl(cleanUrl(urlMatch[0]));
    const urlError = validateFeedUrl(url);
    if (urlError) {
      errors.push({ lineNumber, line, message: urlError });
      return;
    }

    const namePrefix = line.slice(0, urlMatch.index);
    const name = cleanName(namePrefix) || inferFeedName(url, feeds.length + 1);
    feeds.push({ name, url });
  });

  return { feeds, errors };
}

function cleanUrl(value: string): string {
  return value
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/[),.;]+$/g, '');
}

function cleanName(value: string): string {
  return value
    .trim()
    .replace(/^[\s,|:;-]+/, '')
    .replace(/[\s,|:;-]+$/, '')
    .trim();
}

function inferFeedName(url: string, index: number): string {
  try {
    const host = new URL(url).hostname.toLowerCase();

    if (host.includes('gc.com') || host.includes('gamechanger')) {
      return `GameChanger Calendar ${index}`;
    }
    if (host.includes('teamsnap')) {
      return `TeamSnap Calendar ${index}`;
    }
    if (host.includes('teamsideline') || host.includes('tmsdln')) {
      return `TeamSideline Calendar ${index}`;
    }
    if (host.includes('calendar.google.com')) {
      return `Google Calendar ${index}`;
    }
  } catch {
    // Fall through to the generic name.
  }

  return `Calendar ${index}`;
}
