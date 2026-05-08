import { useMemo, useState } from 'react';
import { CalendarPlus, ExternalLink, Info, ListPlus } from 'lucide-react';

import Button from './ui/Button';
import { BulkFeedCreateResult, NewSourceFeedInput } from '../types';
import { parseBulkFeedInput } from '../lib/feedInput';

interface ProviderGuide {
  name: string;
  steps: string;
  linkLabel: string;
  helpUrl: string;
}

interface BulkFeedFormProps {
  onSubmit: (feeds: NewSourceFeedInput[]) => Promise<BulkFeedCreateResult>;
  onCancel: () => void;
}

const PROVIDER_GUIDES: ProviderGuide[] = [
  {
    name: 'GameChanger',
    steps: 'Open the team schedule, use the calendar integration or sync option, then copy the webcal or iCal subscription URL.',
    linkLabel: 'GameChanger calendar sync help',
    helpUrl: 'https://help.gc.com/hc/en-us/articles/115005457626-Integrating-Your-Personal-Calendar',
  },
  {
    name: 'TeamSnap',
    steps: 'Open the team schedule, choose the calendar export or subscribe option, then copy the iCal feed URL.',
    linkLabel: 'TeamSnap calendar help',
    helpUrl: 'https://helpme.teamsnap.com/article/1245-subscribe-to-a-team-schedule',
  },
  {
    name: 'TeamSideline',
    steps: 'Open the organization calendar or division game schedule, click Subscribe, then copy the calendar URL.',
    linkLabel: 'TeamSideline calendar help',
    helpUrl: 'https://support.teamsideline.com/hc/en-us/articles/201151987-How-to-add-your-Organization-Site-Calendar-or-a-Division-game-schedule-to-your-Google-Calendar',
  },
  {
    name: 'Google Calendar',
    steps: 'Open calendar settings, select Integrate calendar, then copy the Secret address in iCal format.',
    linkLabel: 'Google iCal address help',
    helpUrl: 'https://support.google.com/calendar/answer/37648',
  },
];

const EXAMPLE_INPUT = `Parker GameChanger | webcal://example.gc.com/team-calendar.ics
Conner TeamSnap, https://example.teamsnap.com/team_schedule.ics
https://calendar.google.com/calendar/ical/example/private-basic/basic.ics`;

export default function BulkFeedForm({ onSubmit, onCancel }: BulkFeedFormProps) {
  const [rawInput, setRawInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkFeedCreateResult | null>(null);
  const parsed = useMemo(() => parseBulkFeedInput(rawInput), [rawInput]);
  const canSubmit = parsed.feeds.length > 0 && parsed.errors.length === 0 && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const createResult = await onSubmit(parsed.feeds);
      setResult(createResult);
      if (createResult.failed.length === 0) {
        setRawInput('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary-700" />
            <h2 className="text-lg font-semibold text-slate-900">Add Calendar Feeds</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Paste several subscription links at once. Use one calendar per line.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Close
        </Button>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PROVIDER_GUIDES.map((guide) => (
          <div key={guide.name} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">{guide.name}</h3>
            <p className="mt-1 text-sm text-slate-600">{guide.steps}</p>
            <a
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
              href={guide.helpUrl}
              target="_blank"
              rel="noreferrer"
            >
              {guide.linkLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </section>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-700" />
          <p className="text-sm text-blue-900">
            Accepted formats: <strong>Name | URL</strong>, <strong>Name, URL</strong>, or just a URL.
            Webcal links are converted to HTTPS automatically.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="bulk-feed-input" className="mb-2 block font-medium text-slate-900">
          Calendar subscription links
        </label>
        <textarea
          id="bulk-feed-input"
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder={EXAMPLE_INPUT}
          rows={7}
          disabled={submitting}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-700"
        />
      </div>

      {(parsed.feeds.length > 0 || parsed.errors.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-green-200 bg-green-50 p-4">
            <h3 className="text-sm font-semibold text-green-900">Ready to add ({parsed.feeds.length})</h3>
            {parsed.feeds.length === 0 ? (
              <p className="mt-2 text-sm text-green-800">No valid feed lines yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {parsed.feeds.map((feed, index) => (
                  <li key={`${index}-${feed.name}-${feed.url}`} className="text-sm text-green-900">
                    <span className="font-medium">{feed.name}</span>
                    <span className="block truncate text-green-800">{feed.url}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-900">Needs attention ({parsed.errors.length})</h3>
            {parsed.errors.length === 0 ? (
              <p className="mt-2 text-sm text-red-800">No input issues found.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {parsed.errors.map((error) => (
                  <li key={`${error.lineNumber}-${error.line}`} className="text-sm text-red-900">
                    <span className="font-medium">Line {error.lineNumber}:</span> {error.message}
                    <span className="block truncate text-red-800">{error.line}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {result && result.failed.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="text-sm font-semibold text-yellow-900">
            Added {result.created.length}; {result.failed.length} failed
          </h3>
          <ul className="mt-2 space-y-2">
            {result.failed.map((failure, index) => (
              <li key={`${index}-${failure.feed.name}-${failure.feed.url}`} className="text-sm text-yellow-900">
                <span className="font-medium">{failure.feed.name}:</span> {failure.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={!canSubmit}>
          <ListPlus className="h-4 w-4" />
          {submitting
            ? 'Adding...'
            : parsed.feeds.length > 0
              ? `Add ${parsed.feeds.length} Calendar${parsed.feeds.length === 1 ? '' : 's'}`
              : 'Add Calendars'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
