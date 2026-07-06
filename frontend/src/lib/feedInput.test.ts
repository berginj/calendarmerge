import { describe, expect, it } from 'vitest';

import { parseBulkFeedInput, validateFeedUrl } from './feedInput';

describe('feed input helpers', () => {
  it('parses multiple named calendar subscription links', () => {
    const result = parseBulkFeedInput([
      'Parker GameChanger | webcal://example.gc.com/team.ics',
      'Conner TeamSnap, https://example.teamsnap.com/schedule.ics',
      'Google Family https://calendar.google.com/calendar/ical/example/private-basic/basic.ics',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.feeds).toEqual([
      { name: 'Parker GameChanger', url: 'https://example.gc.com/team.ics' },
      { name: 'Conner TeamSnap', url: 'https://example.teamsnap.com/schedule.ics' },
      { name: 'Google Family', url: 'https://calendar.google.com/calendar/ical/example/private-basic/basic.ics' },
    ]);
  });

  it('infers useful names when only URLs are pasted', () => {
    const result = parseBulkFeedInput([
      'https://example.gc.com/team.ics',
      'https://calendar.google.com/calendar/ical/example/basic.ics',
      'https://calendar.teamsideline.com/team.ics',
      'webcal://ical.sportsengine.com/team.ics',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.feeds.map((feed) => feed.name)).toEqual([
      'GameChanger Calendar 1',
      'Google Calendar 2',
      'TeamSideline Calendar 3',
      'SportsEngine Calendar 4',
    ]);
    expect(result.feeds[3].url).toBe('https://ical.sportsengine.com/team.ics');
  });

  it('parses mobile-handoff subscription links with surrounding text', () => {
    const result = parseBulkFeedInput([
      'GameChanger copied from phone: <webcal://example.gc.com/team-calendar.ics>',
      'SportsEngine from mobile app - https://ical.sportsengine.com/team/schedule.ics?token=abc123',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.feeds).toEqual([
      { name: 'GameChanger copied from phone', url: 'https://example.gc.com/team-calendar.ics' },
      { name: 'SportsEngine from mobile app', url: 'https://ical.sportsengine.com/team/schedule.ics?token=abc123' },
    ]);
  });

  it('reports line-level errors without blocking valid lines from preview', () => {
    const result = parseBulkFeedInput([
      'Good Feed | https://example.com/good.ics',
      'Missing URL',
      'Bad Google | https://calendar.google.com/calendar/u/0?cid=example',
    ].join('\n'));

    expect(result.feeds).toEqual([{ name: 'Good Feed', url: 'https://example.com/good.ics' }]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ lineNumber: 2, message: 'Add one calendar subscription URL on this line.' });
    expect(result.errors[1].message).toContain('Google Calendar web URL');
  });

  it('accepts webcal links and rejects non-calendar web UI links', () => {
    expect(validateFeedUrl('webcal://example.com/feed.ics')).toBeNull();
    expect(validateFeedUrl('https://calendar.google.com/calendar/u/0?cid=abc')).toContain('Google Calendar web URL');
  });
});
