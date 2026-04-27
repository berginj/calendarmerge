# PLATFORM_INTEGRATION_NOTES.md

## Purpose

This document captures current research on calendar-feed behavior for youth sports and athletics platforms. The goal is to guide implementation of a calendar merge service that aggregates multiple ICS/iCalendar feeds into a unified family calendar.

Primary use case:

- Families with kids on multiple youth sports teams.
- Aggregating calendars from platforms such as GameChanger, TeamSnap, SportsEngine, LeagueApps, TeamLinkt, SportsConnect, ArbiterSports, MaxPreps, FinalForms, and Hudl.
- Detecting duplicate events across feeds.
- Detecting schedule changes such as time, date, location, or cancellation.
- Filtering event types such as games, practices, meetings, tournaments, and team events.
- Handling partial failures gracefully.
- Polling-based sync only; no webhook dependency.

---

## Executive Summary for Coding Agent

### What Is Possible

The application can support most platforms by treating their calendar exports as standard ICS/iCalendar subscription feeds.

The strongest confirmed feed-support platforms are:

1. GameChanger
2. TeamSnap
3. SportsEngine
4. LeagueApps
5. TeamLinkt
6. SportsConnect
7. ArbiterSports

These platforms publish user-facing instructions for subscribing to or exporting schedules via calendar links, iCal, ICS, or webcal-style calendar subscriptions.

### What Is Not Reliably Possible

The coding agent should **not assume** the following unless the user provides a real feed sample or platform-specific documentation:

- Exact feed URL structure.
- Stable URL path patterns.
- Public developer API availability.
- Documented rate limits.
- `ETag` support.
- `Last-Modified` support.
- Reliable `SEQUENCE` behavior.
- Reliable `STATUS:CANCELLED` behavior.
- Consistent event categories.
- Consistent `UID` behavior across platforms.
- Consistent recurrence handling.
- Real-time updates.

Most official help articles explain how users subscribe to feeds, but they generally do **not** document backend feed schema, throttling, conditional request headers, event lifecycle semantics, or API guarantees.

### Core Implementation Position

Implement the system as a **defensive ICS polling and normalization engine**, not as a first-class API integration.

Use these principles:

- Fetch feeds on a conservative schedule.
- Parse ICS using a robust parser.
- Normalize event fields.
- Store snapshots.
- Diff snapshots to detect changes.
- Do not rely on one field such as `UID`.
- Treat feed data as eventually consistent.
- Treat each source feed as independently unreliable.
- Degrade gracefully when one feed fails.

---

# Global Architecture Guidance

## Recommended Polling Strategy

Because documented rate limits are generally unavailable, polling should be conservative.

Recommended baseline:

```text
Default polling interval: 30–60 minutes
Aggressive polling floor: 15 minutes
Avoid polling faster than every 15 minutes unless the user explicitly forces manual refresh
```

Platform-specific recommendations:

| Platform | Recommended Polling | Reason |
|---|---:|---|
| GameChanger | 30 minutes default; 15 minutes only for manual/high-priority refresh | GameChanger documents Google Calendar can take up to 24 hours to sync changes, indicating downstream refresh delay; no official rate limit was found. |
| TeamSnap | 30–60 minutes | TeamSnap documents calendar subscriptions and notes Google may take up to 24 hours to populate or update subscribed calendars. |
| SportsEngine | 30–60 minutes | SportsEngine states iCal feeds added to sites are refreshed once every 30 minutes. |
| LeagueApps | 60–120 minutes | LeagueApps documents Google Calendar updates subscribed calendars around once per day; client-side refresh is outside our control. |
| TeamLinkt | 30–60 minutes | TeamLinkt documents iCal URL subscription but does not document rate limits. |
| SportsConnect | 30–60 minutes | SportsConnect documents copying a calendar feed URL but does not document rate limits. |
| ArbiterSports | 30–60 minutes | ArbiterSports documents iCal URL subscription but does not document rate limits. |
| MaxPreps | Not a primary ICS source unless a feed is discovered | MaxPreps documentation found covers schedule management and syncing schedules/rosters to GameChanger, not direct ICS export. |
| FinalForms | Not a primary ICS source | FinalForms appears primarily focused on registration, forms, eligibility, communication, and athletic management; no source-backed calendar export behavior was found. |
| Hudl | Not a primary ICS source unless a feed is discovered | Hudl has schedule-management support topics, but no source-backed ICS export behavior was found in the searched sources. |

## Do Not Depend on Calendar Client Refresh Behavior

Google Calendar, Apple Calendar, and Outlook have their own refresh behavior. These delays do not necessarily represent the source platform’s backend behavior.

Examples:

- GameChanger says Google can take up to 24 hours to sync changes from GameChanger to subscribed calendars.
- TeamSnap says Google can take up to 24 hours to fully populate subscribed calendars.
- LeagueApps says Google Calendar updates subscribed calendars around once per day and that this setting cannot be adjusted.
- Microsoft Outlook documentation says subscribed calendars automatically refresh when the external calendar changes, but updates can take more than 24 hours and should happen approximately every 3 hours.

Our service should fetch source ICS URLs directly rather than depending on a user’s Google/Apple/Outlook calendar as the intermediate source.

---

# Data Model Recommendation

Normalize every ICS event into an internal event object.

```ts
type SourcePlatform =
  | "gamechanger"
  | "teamsnap"
  | "sportsengine"
  | "leagueapps"
  | "teamlinkt"
  | "sportsconnect"
  | "arbiter"
  | "maxpreps"
  | "finalforms"
  | "hudl"
  | "unknown";

type NormalizedEvent = {
  sourcePlatform: SourcePlatform;
  sourceFeedId: string;
  sourceFeedUrlHash: string;

  rawUid?: string;
  rawSequence?: number;
  rawStatus?: string;
  rawSummary?: string;
  rawDescription?: string;
  rawLocation?: string;
  rawOrganizer?: string;
  rawCategories?: string[];

  normalizedTitle: string;
  normalizedEventType: "game" | "practice" | "meeting" | "tournament" | "other" | "unknown";

  startUtc: string;
  endUtc?: string;
  timezone?: string;

  locationName?: string;
  address?: string;

  opponent?: string;
  homeAway?: "home" | "away" | "neutral" | "unknown";

  isCancelled: boolean;
  isRescheduledMarker: boolean;

  contentHash: string;
  identityHash: string;
  fuzzyMatchHash: string;

  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt?: string;

  rawIcsComponent: string;
};
```

## Required Hashes

### `contentHash`

Used to detect changed event content.

Recommended inputs:

```text
summary + start + end + location + description + status + categories
```

### `identityHash`

Used when `UID` is stable.

Recommended inputs:

```text
sourceFeedId + rawUid
```

### `fuzzyMatchHash`

Used when `UID` is missing, unstable, duplicated, or not sufficient.

Recommended inputs:

```text
normalizedTitle + normalizedDate + normalizedLocation + opponent + eventType
```

---

# Change Detection Strategy

## Change Types

The sync engine should detect:

```ts
type ChangeType =
  | "new_event"
  | "removed_event"
  | "time_changed"
  | "date_changed"
  | "location_changed"
  | "title_changed"
  | "cancelled"
  | "rescheduled"
  | "duplicate_candidate"
  | "unchanged";
```

## Diff Algorithm

Use this priority order:

1. Match by `sourceFeedId + UID`.
2. If no UID match, match by fuzzy event identity.
3. If matched and content differs, compare fields:
   - Start/end changed → `time_changed` or `date_changed`.
   - Location changed → `location_changed`.
   - Summary changed → `title_changed`.
   - Status indicates cancelled → `cancelled`.
   - Summary includes “RESCHEDULED” → `rescheduled`.
4. If an event disappears from a feed:
   - Mark as `removed_event`.
   - Do not immediately delete from merged calendar.
   - Retain tombstone state for a configurable grace period.
5. If a similar new event appears close to a removed or rescheduled event:
   - Mark as possible reschedule.
   - Link old and new records.

## Why Not UID Only?

Do not rely only on `UID`.

Some platforms document behavior that may create separate events rather than updating the original event. LeagueApps explicitly states that if a game is rescheduled, the old game will be marked as `RESCHEDULED` and the new game will appear separately on the calendar.

---

# Cancellation and Reschedule Handling

## Standard ICS Handling

Standard ICS cancellation patterns may include `STATUS:CANCELLED`, `METHOD:CANCEL`, same `UID`, and higher `SEQUENCE`, but not all platform feeds can be assumed to implement this consistently.

## Practical Handling

Implement cancellation detection using multiple signals:

```text
STATUS:CANCELLED
METHOD:CANCEL
SUMMARY contains "cancelled", "canceled", "cancelled:", "canceled:"
DESCRIPTION contains cancellation terms
Event disappeared from feed
Platform-specific marker such as LeagueApps "RESCHEDULED"
```

## LeagueApps Special Case

LeagueApps must get special handling.

LeagueApps documents that if a game is rescheduled, the old game will be marked as `RESCHEDULED`, and the new game will appear separately on the calendar.

Coding agent should implement:

```ts
if (platform === "leagueapps" && summaryIncludesRescheduled(event)) {
  event.isRescheduledMarker = true;
  event.isCancelled = false; // Do not assume cancelled; treat as old/rescheduled marker.
}
```

Then attempt to link the old event to the new event using:

```text
same team/feed
similar title
same opponent if detectable
same or nearby location
new date/time after old date/time
created/firstSeen close to marker detection time
```

---

# ICS Parser Requirements

Use a parser that supports:

- `VEVENT`
- `VTIMEZONE`
- floating times
- `TZID`
- UTC times
- all-day events
- recurrence rules (`RRULE`)
- recurrence exceptions (`EXDATE`)
- recurrence overrides (`RECURRENCE-ID`)
- custom `X-*` properties
- malformed or partially valid ICS

Recurring events and timezone handling are common sources of ICS bugs.

## Recommended Defensive Parser Behavior

- Preserve the raw ICS component for troubleshooting.
- Parse unknown properties into a flexible metadata bag.
- Normalize all times to UTC.
- Preserve original timezone.
- Validate date ranges.
- Handle missing `DTEND` by applying platform or event-type defaults.
- Treat invalid feeds as source errors, not global sync failures.

---

# Feed Fetching Requirements

## HTTP Behavior

For each feed fetch:

- Use a clear `User-Agent`.
- Timeout quickly.
- Retry with backoff.
- Store HTTP status.
- Store last successful fetch time.
- Store last changed hash.
- Support conditional requests if response headers provide `ETag` or `Last-Modified`.
- Do not require `ETag` or `Last-Modified`.

No searched platform source explicitly documented `ETag` or `Last-Modified` behavior for these sports calendar feeds. Therefore, implementation may support conditional GET opportunistically but must not depend on it.

## Failure Handling

Feed failures should be isolated.

```ts
type FeedHealth = {
  feedId: string;
  lastAttemptAt: string;
  lastSuccessAt?: string;
  lastHttpStatus?: number;
  consecutiveFailures: number;
  lastError?: string;
  stale: boolean;
};
```

Recommended stale thresholds:

```text
warning: no successful fetch for 24 hours
error: no successful fetch for 72 hours
disabled_candidate: no successful fetch for 14 days
```

These thresholds are product choices, not platform guarantees.

---

# Platform Notes

---

# GameChanger

## Overview

GameChanger is a mobile-first team management platform with strong baseball/softball usage. GameChanger documents calendar integration through the app and supports syncing team schedule data to iOS or Google calendars.

## Calendar Feed Access

GameChanger documents this access path:

```text
Home tab → select team → gear icon → Schedule Sync → Sync Schedule to Your Calendar
```

For iOS, the user selects “Sync Apple Calendar.” For Google Calendar, the user can copy/send the link and add it to Google Calendar from URL.

GameChanger says staff, players, and parents/guardians sync all team events including practices, while followers only sync the game schedule.

A third-party guide also describes getting the GameChanger schedule URL by going to the schedule page, using the gear icon, choosing Schedule Sync, and sending/copying the link.

## Authentication

The official documentation confirms that a calendar link can be copied/sent and added to a calendar, but it does not publish the exact authentication model or token structure.

Implementation guidance:

- Treat the feed URL as a bearer secret.
- Store it encrypted or at least protected.
- Do not log the full URL.
- Do not assume URL format.
- Do not assume token expiration behavior.

## Rate Limits

No official GameChanger ICS rate limits were found.

GameChanger states Google can take up to 24 hours to sync changes made in GameChanger to subscribed calendars.

Recommendation:

```text
Default polling: every 30 minutes
Manual refresh: allow, but rate-limit per user/feed
Do not poll faster than 15 minutes automatically
```

## ICS Format

GameChanger documents calendar sync, but the official article does not document the exact ICS fields, sample ICS payload, custom properties, `UID`, `SEQUENCE`, cancellation behavior, or HTTP headers.

Implementation guidance:

- Parse as generic ICS.
- Do not assume categories exist.
- Infer event type from summary/description when needed.
- Preserve raw event.

## Update Behavior

GameChanger confirms subscribed calendars update from GameChanger changes, but notes Google may take up to 24 hours.

GameChanger also documents a workaround for Google Calendar where adding `&1=1` to the end of the Webcal link may cause the feed to refresh more frequently.

Coding agent guidance:

- Do not mutate user-provided URLs automatically by appending `&1=1`.
- If supporting this, make it an optional advanced setting.
- Prefer direct service-side polling of the original feed URL.

## API / Developer Resources

No official public developer API for this use case was found in the cited sources.

Unofficial GitHub and Reddit sources discuss GameChanger API access, bearer tokens, and API endpoints, but these are not official platform documentation and should not be used as a production dependency without user acceptance of risk.

## Integration Recommendation

Implement GameChanger as a generic ICS source with optional platform-specific heuristics:

```ts
platform: "gamechanger"
expectedEventTypes: ["game", "practice", "event"]
trustUid: "medium"
trustSequence: "unknown"
supportsOfficialApi: false
recommendedPollMinutes: 30
```

Do not implement a hardcoded GameChanger feed URL pattern unless the user provides actual sample URLs.

---

# TeamSnap

## Overview

TeamSnap is a multi-sport team management platform with schedule subscription support.

## Calendar Feed Access

TeamSnap documents that users can subscribe to a team’s full schedule of games and events and that subscribed calendars update automatically when the schedule changes.

TeamSnap documents this web access path:

```text
Log into TeamSnap on web → team site → Schedule tab → Settings → Sync Calendar / Export → Copy calendar link
```

TeamSnap also supports a combined TeamSnap schedule for users who are members of multiple teams.

## Authentication

TeamSnap documents copying a calendar link, but the source does not specify token format, expiration, or whether the URL is publicly accessible without authentication.

Implementation guidance:

- Treat the copied TeamSnap link as a bearer secret.
- Do not infer token behavior.
- Do not log full URL.

## Rate Limits

No official TeamSnap ICS rate limits were found.

TeamSnap notes Google can take up to 24 hours to fully populate subscribed calendars.

Recommendation:

```text
Default polling: every 30–60 minutes
Avoid aggressive polling
```

## ICS Format

TeamSnap documents iCalendar-compatible subscriptions but does not publish detailed ICS schema in the cited source.

TeamSnap notes subscribed calendars display up to 6 months of past games and events.

Coding agent guidance:

- Persist historical events locally.
- Do not rely on the feed as a long-term historical archive.
- Expect older events to fall out of the feed.

## Integration Recommendation

```ts
platform: "teamsnap"
trustUid: "medium"
trustSequence: "unknown"
historyWindow: "feed may include up to 6 months past events"
recommendedPollMinutes: 60
```

---

# SportsEngine

## Overview

SportsEngine is a multi-sport platform with site/team calendar support.

## Calendar Feed Access

SportsEngine documents subscribing to iCal feeds from a team page, calendar page, or event list by clicking the iCal feed icon and copying the link.

SportsEngine states the iCal feed option may not appear if there is nothing on the calendar or event list.

## Authentication

The cited SportsEngine source documents copying an iCal feed link, but does not specify token structure, authentication, or feed expiration.

## Rate Limits

SportsEngine states that iCal feeds added to sites are refreshed once every 30 minutes.

Recommendation:

```text
Default polling: every 30–60 minutes
Do not poll faster than the documented 30-minute refresh interval
```

## ICS Format

SportsEngine documents iCal subscription behavior but does not publish detailed ICS payload structure in the cited source.

## Update Behavior

SportsEngine states that after importing the feed, the subscribed calendar reflects additions or changes made to the website calendar.

## Integration Recommendation

```ts
platform: "sportsengine"
recommendedPollMinutes: 30
trustUid: "medium"
trustSequence: "unknown"
```

---

# LeagueApps

## Overview

LeagueApps is a recreation league and sports management platform with calendar sync support.

## Calendar Feed Access

LeagueApps documents two calendar options: Subscribe and Import. Subscribe creates a calendar that auto-updates when LeagueApps events change; Import downloads a file and does not auto-update.

LeagueApps documents this access path:

```text
Organization website → Dashboard → My Schedule
or
My Registered Activities → team details → Subscribe to Calendar
```

LeagueApps supports Apple Calendar/iCal, Google Calendar, Copy Link, and mobile app subscription flows.

## Authentication

LeagueApps documents copying a subscription link but does not specify token format, expiration, or whether the feed is accessible without authentication after link generation.

## Rate Limits

No official LeagueApps polling rate limit was found.

LeagueApps states Google Calendar updates subscribed calendars around once per day and that this cannot be adjusted.

Recommendation:

```text
Default polling: every 60–120 minutes
Manual refresh: allowed but rate-limited
```

## ICS Format and Quirks

LeagueApps documents that its calendar sync covers events and games one month in the past and up to six months in the future.

LeagueApps documents important reschedule behavior:

```text
If a game is rescheduled, the old game is marked as RESCHEDULED and the new game appears separately on the calendar.
```

LeagueApps also states that if an event such as a practice or meeting is changed, the event details update.

## Integration Recommendation

LeagueApps requires platform-specific logic:

```ts
platform: "leagueapps"
recommendedPollMinutes: 120
trustUid: "low-to-medium"
specialHandling: ["rescheduled_marker", "separate_new_event"]
historyWindowPastMonths: 1
historyWindowFutureMonths: 6
```

Required logic:

```ts
function isLeagueAppsRescheduleMarker(event) {
  return event.summary?.toLowerCase().includes("rescheduled");
}
```

Do not automatically delete a rescheduled old event; mark it as superseded if a matching new event is found.

---

# FinalForms

## Overview

FinalForms is primarily an athletic registration, forms, eligibility, communication, and athletic management platform. Its official athletic management page describes registration, waivers, forms, alerts, eligibility, rosters, communication, attendance, medical information, equipment, and reporting capabilities.

## Calendar Feed Access

No source-backed FinalForms ICS/iCal export or calendar subscription behavior was found.

School athletics pages commonly describe FinalForms as a registration and clearance platform, while schedules may be hosted elsewhere such as LeagueMinder. One school athletics page describes LeagueMinder as the official source for schedules and FinalForms as the sports registration platform.

## Integration Recommendation

Do not implement FinalForms as a direct calendar source unless the user provides:

- a FinalForms ICS URL,
- official documentation,
- or a sample export.

Represent FinalForms as:

```ts
platform: "finalforms"
calendarFeedSupport: "not_confirmed"
recommendedAction: "do_not_add_platform_specific_adapter_until_sample_feed_exists"
```

If a school uses FinalForms plus a separate schedule provider, integrate with the schedule provider instead.

---

# TeamLinkt

## Overview

TeamLinkt is a youth sports platform with team schedules and calendar subscription support.

## Calendar Feed Access

TeamLinkt documents that team members can subscribe to team schedules directly from a personal calendar using an iCal URL.

TeamLinkt documents app access:

```text
Events tab → three dots → Subscribe to Calendar
```

TeamLinkt documents web access:

```text
Select team → Schedules → Schedule → Subscribe
```

TeamLinkt provides Apple, Webcal/Google, and iCal options.

## Authentication

TeamLinkt documents copying or using an iCal URL but does not specify token format or expiration.

## Rate Limits

No official rate limits were found.

Recommendation:

```text
Default polling: every 30–60 minutes
```

## Integration Recommendation

```ts
platform: "teamlinkt"
recommendedPollMinutes: 60
trustUid: "unknown"
trustSequence: "unknown"
```

---

# SportsConnect

## Overview

SportsConnect is part of the Stack Sports ecosystem and includes scheduling/calendar export behavior.

## Calendar Feed Access

SportsConnect documents exporting a scheduler calendar to Google, Outlook, or iCal by going to the Schedules tab, selecting Calendar, scrolling to Sync, and copying/pasting the calendar feed URL.

## Authentication

The source documents copying a calendar feed URL but does not specify token structure, authorization model, or expiration.

## Rate Limits

No official rate limits were found.

Recommendation:

```text
Default polling: every 30–60 minutes
```

## Integration Recommendation

```ts
platform: "sportsconnect"
recommendedPollMinutes: 60
trustUid: "unknown"
trustSequence: "unknown"
```

Implement as generic ICS unless feed samples show platform-specific quirks.

---

# Hudl

## Overview

Hudl provides team management and schedule-management support topics. Hudl support lists schedule-related articles such as adding a season, setting current season, adding events, editing event information, adding recurring events, removing events, viewing organization calendar, and removing a season.

Hudl also has schedule-management support topics for Volleymetrics, including add/edit/delete event articles.

## Calendar Feed Access

No source-backed Hudl ICS/iCal calendar export behavior was found in the searched sources.

## Integration Recommendation

Do not implement Hudl as a calendar-feed platform unless the user provides:

- a Hudl ICS URL,
- official Hudl calendar export documentation,
- or a sample ICS file.

Represent Hudl as:

```ts
platform: "hudl"
calendarFeedSupport: "not_confirmed"
recommendedAction: "generic_ics_only_if_user_provides_url"
```

---

# MaxPreps

## Overview

MaxPreps is a high school sports platform for schedules, scores, rankings, rosters, stats, and team information. MaxPreps describes itself as a high school sports platform where coaches and athletic directors can update schedules, rosters, scores, and stats.

## Calendar Feed Access

No source-backed MaxPreps direct ICS/iCal export behavior was found in the searched sources.

MaxPreps documents schedule management through coach admin accounts, including entering game information such as date, time, location, and game type.

MaxPreps also documents syncing schedule and roster data from MaxPreps to GameChanger for baseball and softball during GameChanger team setup.

## API / Integration Notes

A GitHub project exists that generates spreadsheets from MaxPreps schedule URLs, but this is unofficial and should not be treated as a supported MaxPreps integration.

## Integration Recommendation

Do not implement MaxPreps as a direct ICS source unless the user provides a calendar feed.

Possible integration paths:

1. If user has a MaxPreps-to-GameChanger sync, consume the GameChanger ICS feed instead.
2. If user provides a MaxPreps schedule page, do **not** scrape by default unless product explicitly supports scraping and accepts fragility.
3. If user provides a CSV export or generated file, support import as a separate static-source adapter.

Represent MaxPreps as:

```ts
platform: "maxpreps"
calendarFeedSupport: "not_confirmed"
preferredPath: "consume_gamechanger_if_maxpreps_schedule_syncs_to_gamechanger"
```

---

# ArbiterSports

## Overview

ArbiterSports is used for officials scheduling and school athletics scheduling.

## Calendar Feed Access

ArbiterSports documents that officials can get an iCal URL by going to Settings or Preferences and using Calendar Sync / Send Email. The user receives an email labeled “iCal Feed” from ArbiterSports and copies the URL into a personal calendar.

ArbiterSports also documents school iCal feed generation via:

```text
Settings → iCal Feed → choose feed options → Create Feed → Copy
```

School feed options include games, events, tournaments, practices, status filtering, teams, and home/away filters.

## Authentication

ArbiterSports documents that the iCal URL is sent by email or copied after feed creation, but does not specify token format or expiration.

Implementation guidance:

- Treat the URL as sensitive.
- Expect feeds to be filtered based on how they were generated.
- Do not assume a school feed contains all events.

## Rate Limits

No official rate limits were found.

Recommendation:

```text
Default polling: every 30–60 minutes
```

## Integration Recommendation

```ts
platform: "arbiter"
recommendedPollMinutes: 60
supportsFilteredFeeds: true
trustUid: "unknown"
trustSequence: "unknown"
```

---

# Cross-Platform Known Issues

## Calendar Client Delays

External calendar clients may not update quickly.

- GameChanger says Google can take up to 24 hours to sync changes.
- TeamSnap says Google can take up to 24 hours to fully populate subscribed calendars.
- LeagueApps says Google Calendar updates subscribed calendars around once per day.
- Outlook documentation says subscribed calendar updates can take more than 24 hours, although updates should happen approximately every 3 hours.

## Recurrence and Timezone Bugs

Recurring events and timezone conversion can be problematic in ICS processing. Known ICS parsing issues include recurring events shifting by one day because of timezone/DST handling.

## Import vs Subscribe

The service should distinguish static imports from live subscriptions.

LeagueApps explicitly documents that importing a downloaded calendar file will not update if changes are made in LeagueApps, while subscribing will auto-update.

Outlook documentation similarly distinguishes importing an `.ics` file, which does not refresh, from subscribing to an online calendar, which refreshes when the external calendar changes.

---

# Implementation Checklist

## Must Implement

- Generic ICS feed ingestion.
- Feed-level health tracking.
- Snapshot storage.
- Event normalization.
- UTC time normalization.
- Raw ICS preservation.
- Duplicate detection.
- Change detection.
- Reschedule detection.
- Cancellation detection.
- Per-feed polling intervals.
- Backoff on failures.
- Partial failure isolation.
- Manual refresh with rate limiting.
- Secure handling of feed URLs.

## Should Implement

- Platform-specific adapters for:
  - GameChanger
  - TeamSnap
  - SportsEngine
  - LeagueApps
  - TeamLinkt
  - SportsConnect
  - ArbiterSports

- Generic/manual ICS adapter for:
  - MaxPreps
  - FinalForms
  - Hudl
  - Unknown platforms

## Should Not Implement Yet

Do not implement hardcoded direct integrations for:

- FinalForms
- Hudl
- MaxPreps

unless the user provides actual feed samples or official feed documentation.

Do not implement unofficial GameChanger API access as the default production integration. Unofficial sources discuss GameChanger API endpoints and bearer-token access, but these are not official documentation.

---

# Suggested Adapter Interface

```ts
export interface CalendarPlatformAdapter {
  platform: SourcePlatform;

  normalizeEvent(rawEvent: RawIcsEvent, context: FeedContext): NormalizedEvent;

  detectEventType(event: NormalizedEvent): NormalizedEvent["normalizedEventType"];

  detectCancellation(event: NormalizedEvent): boolean;

  detectRescheduleMarker(event: NormalizedEvent): boolean;

  getRecommendedPollIntervalMinutes(): number;

  getTrustProfile(): {
    uid: "high" | "medium" | "low" | "unknown";
    sequence: "high" | "medium" | "low" | "unknown";
    statusCancelled: "high" | "medium" | "low" | "unknown";
    categories: "high" | "medium" | "low" | "unknown";
  };
}
```

---

# Suggested Trust Profiles

```ts
export const PLATFORM_TRUST_PROFILES = {
  gamechanger: {
    uid: "unknown",
    sequence: "unknown",
    statusCancelled: "unknown",
    categories: "unknown",
    recommendedPollMinutes: 30
  },

  teamsnap: {
    uid: "unknown",
    sequence: "unknown",
    statusCancelled: "unknown",
    categories: "unknown",
    recommendedPollMinutes: 60
  },

  sportsengine: {
    uid: "unknown",
    sequence: "unknown",
    statusCancelled: "unknown",
    categories: "unknown",
    recommendedPollMinutes: 30
  },

  leagueapps: {
    uid: "low",
    sequence: "unknown",
    statusCancelled: "unknown",
    categories: "unknown",
    recommendedPollMinutes: 120,
    specialCases: ["rescheduled_marker_creates_separate_new_event"]
  },

  teamlinkt: {
    uid: "unknown",
    sequence: "unknown",
    statusCancelled: "unknown",
    categories: "unknown",
    recommendedPollMinutes: 60
  },

  sportsconnect: {
    uid: "unknown",
    sequence: "unknown",
    statusCancelled: "unknown",
    categories: "unknown",
    recommendedPollMinutes: 60
  },

  arbiter: {
    uid: "unknown",
    sequence: "unknown",
    statusCancelled: "unknown",
    categories: "unknown",
    recommendedPollMinutes: 60,
    supportsFilteredFeeds: true
  },

  maxpreps: {
    calendarFeedSupport: "not_confirmed",
    recommendedAction: "do_not_enable_without_user_provided_feed"
  },

  finalforms: {
    calendarFeedSupport: "not_confirmed",
    recommendedAction: "do_not_enable_without_user_provided_feed"
  },

  hudl: {
    calendarFeedSupport: "not_confirmed",
    recommendedAction: "do_not_enable_without_user_provided_feed"
  }
};
```

---

# User-Facing Product Guidance

## Feed Add Flow

When a user adds a calendar feed:

1. Ask for the calendar subscription URL.
2. Detect platform if possible from URL/domain/title.
3. Fetch once immediately.
4. Parse and validate ICS.
5. Show detected:
   - number of events,
   - date range,
   - sample event titles,
   - detected timezone,
   - platform guess.
6. Let user confirm.
7. Store feed URL securely.
8. Start scheduled polling.

## Validation Errors

Show user-friendly messages:

```text
This does not look like a valid ICS calendar feed.
The feed could not be reached.
The feed requires authentication or has expired.
The feed returned no events.
The feed contains events but no future events.
The feed parsed successfully but has timezone issues.
```

## Manual Refresh

Manual refresh should be available but rate-limited.

Suggested guardrails:

```text
Per feed: no more than once every 5 minutes manually
Per user: no more than 10 manual refreshes per hour
```

These are product-level recommendations, not platform-published limits.

---

# Security Requirements

Calendar feed URLs often function like bearer tokens.

Implement:

- Do not log full URLs.
- Redact query strings in logs.
- Store URL encrypted if possible.
- Hash URL for dedupe.
- Allow users to delete feeds.
- Treat copied URLs as secrets.
- Avoid sharing feed URLs in support logs.

---

# Recommended MVP Scope

## MVP Platform Support

Implement these first:

1. Generic ICS adapter
2. GameChanger platform label + heuristics
3. TeamSnap platform label + heuristics
4. SportsEngine platform label + heuristics
5. LeagueApps special reschedule handling
6. TeamLinkt generic ICS support
7. SportsConnect generic ICS support
8. ArbiterSports generic ICS support

## Defer

Defer platform-specific integrations for:

- FinalForms
- Hudl
- MaxPreps

until real feed URLs or official feed documentation are available.

---

# Test Cases

## Generic Feed

- Valid ICS with one event.
- Valid ICS with multiple events.
- ICS with missing `DTEND`.
- ICS with all-day event.
- ICS with timezone.
- ICS with UTC.
- ICS with recurrence.
- ICS with recurrence exception.
- ICS with duplicate UIDs.
- ICS with malformed event.

## Change Detection

- Same UID, changed start time.
- Same UID, changed location.
- Same UID, changed summary.
- Event disappears.
- Event reappears.
- Event marked `STATUS:CANCELLED`.
- Event summary includes “Cancelled”.
- Event summary includes “RESCHEDULED”.
- LeagueApps pattern: old event marked `RESCHEDULED`, new event appears separately.

## Multi-Feed Deduplication

- Same event from GameChanger and TeamSnap.
- Same event from parent feed and team feed.
- Same tournament game from league feed and team feed.
- Same event with slightly different field names.
- Same event with different timezones.
- Same event with one feed missing location.

---

# Final Guidance to Coding Agent

Build this as a resilient ICS aggregation product, not as a set of fragile private API integrations.

Assume:

- Feeds are eventually consistent.
- Feed URLs are secrets.
- Rate limits are mostly undocumented.
- Calendar clients are slow and inconsistent.
- `UID` is helpful but not sufficient.
- `SEQUENCE` may not exist or may not be reliable.
- Platforms may remove cancelled events instead of marking them.
- Platforms may create new events for reschedules.
- Historical windows may be limited.
- Some listed platforms may not expose usable ICS feeds.

The most important technical features are:

1. robust ICS parsing,
2. snapshot diffing,
3. fuzzy duplicate detection,
4. reschedule detection,
5. feed health tracking,
6. graceful partial failure handling,
7. conservative polling.

The system should work well even when the platform gives only a basic ICS feed and no API guarantees.

---

# Source References

- GameChanger calendar integration: https://help.gc.com/hc/en-us/articles/115005457626-Integrating-Your-Personal-Calendar
- TeamSnap subscribe to team schedule: https://helpme.teamsnap.com/article/1245-subscribe-to-a-team-schedule
- SportsEngine iCal feed: https://help.sportsengine.com/en/articles/6307106-how-to-subscribe-to-an-ical-feed
- LeagueApps calendar sync: https://support.leagueapps.com/hc/en-us/articles/360039381354-Calendar-Sync
- TeamLinkt calendar subscription: https://help.teamlinkt.com/en/articles/4938653-subscribe-to-your-teamlinkt-calendar
- SportsConnect scheduler calendar export: https://stacksports.my.site.com/helpcenter/s/article/SportConnectSupportClubProduct228184787HowtoExportaSchedulerCalendartoGoogleOutlookiCal
- ArbiterSports school iCal feed: https://arbitersportshelp.zendesk.com/hc/en-us/articles/19923868714893-Subscribing-to-iCal-Feed-Schools
- ArbiterSports calendar feed: https://arbiter.my.site.com/schools/s/article/Subscribing-to-an-ArbiterSports-Calendar-Feed
- Outlook subscribed calendar behavior: https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c
- iCalendar cancellation discussion: https://stackoverflow.com/questions/10551764/how-to-cancel-an-calendar-event-using-ics-files
- ICS recurrence/timezone issue example: https://github.com/calcom/cal.com/issues/14641
- FinalForms athletic management: https://www.finalforms.com/athletic-management
- MaxPreps schedule management: https://support.maxpreps.com/hc/en-us/articles/202055604-Schedule-Management
- MaxPreps to GameChanger schedule/roster sync: https://support.maxpreps.com/hc/en-us/articles/360041632034-Sync-Schedule-Roster-from-MaxPreps-to-GameChanger
- Hudl schedule support topics: https://support.hudl.com/s/topic/0TOVY0000000Orz4AE/schedulehudl?language=en_US
