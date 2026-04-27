# Sports Platform Calendar Integration - Research Prompt

Use this prompt with Claude or another AI assistant to research sports management platforms and their calendar feeds.

---

## Research Prompt

I'm building a calendar merge service that aggregates ICS calendar feeds from multiple youth sports management platforms into a unified calendar. I need detailed technical information about how these platforms expose calendar data.

### Platforms to Research (Priority Order)

1. **GameChanger** (highest priority - baseball/softball focused)
2. **TeamSnap** (multi-sport)
3. **SportsEngine** (multi-sport, NBC Sports owned)
4. **LeagueApps** (multi-sport recreation leagues)
5. **FinalForms** (high school athletics)
6. **TeamLinkt** (youth sports)
7. **SportsConnect** (tournament management)
8. **Hudl** (video platform with scheduling)
9. **MaxPreps** (high school sports)
10. **ArbiterSports** (officials/scheduling)

### Required Information Per Platform

For each platform, please research and document:

#### 1. **Calendar Feed Access**
- How do users export/subscribe to calendars?
- Is there a public ICS feed URL?
- Example URL format (with placeholders): `https://example.com/feeds/{teamId}/calendar.ics`
- Is the feed URL visible in the UI? Where?
- Can feeds be bookmarked/shared?

#### 2. **Authentication & Authorization**
- Are feeds publicly accessible with URL?
- Do they require authentication? (API key, OAuth, basic auth?)
- Are there different permission levels (public team view vs private team member)?
- How long do feed URLs remain valid?
- Do they use URL tokens/signatures?

#### 3. **Rate Limiting & Throttling**
- What are the documented rate limits?
- What are the observed/community-known limits?
- How do they respond to rate limit violations? (429 status? Temporary ban?)
- Recommended polling frequency
- Any burst allowances?

#### 4. **ICS Format & Quirks**
- Do they follow standard ICS/iCalendar (RFC 5545)?
- Any non-standard properties or extensions?
- Common issues users report with their feeds?
- How do they handle:
  - All-day events
  - Recurring events
  - Time zones
  - Cancellations (STATUS:CANCELLED or removal?)
  - Rescheduling (update SEQUENCE or create new event?)
  - Location formatting
  - Event descriptions

#### 5. **Event Metadata**
- What properties are included in events?
  - Summary format (e.g., "Team vs Opponent" or "Game @ Location")
  - Location details (address, field name, facility)
  - Description content
  - Categories/tags (e.g., CATEGORIES:Game,Practice)
  - Attendees/participants
  - Organizer information
  - Custom properties (X-*)

#### 6. **Update Behavior**
- How frequently do they update feeds?
- Is there a Last-Modified header?
- Do they support ETag for conditional requests?
- When a game time changes, how is it reflected?
  - New UID?
  - Same UID with updated SEQUENCE?
  - Same UID without SEQUENCE change?
- When a game is cancelled:
  - Removed from feed?
  - Marked with STATUS:CANCELLED?
  - Other approach?

#### 7. **Known Issues & Workarounds**
- Common complaints from users about calendar feeds?
- Bugs or inconsistencies?
- Workarounds that developers have found?
- Third-party tools that parse their feeds?
- Community discussions (Reddit, forums, GitHub issues)?

#### 8. **API & Developer Resources**
- Do they have a developer API?
- API documentation links
- Developer portal or signup process
- Official integrations or partnerships?
- Is there an unofficial/reverse-engineered API?

#### 9. **Subscription/Pricing Impact**
- Does calendar export require paid subscription?
- Different tiers with different access?
- Free tier limitations?

#### 10. **Real-World Examples**
- If possible, provide example feed URLs (anonymized/sanitized)
- Screenshots of where users find feed URLs
- Sample ICS content showing their format
- Links to documentation or help articles

### Output Format

Please structure your research as:

```markdown
# Platform Name

## Overview
Brief description of the platform and its focus

## Calendar Feed Access
[Details]

## Authentication
[Details]

## Rate Limits
- Documented limit: X requests per Y
- Recommended polling: Every Z hours
- Notes: [any special considerations]

## ICS Format
[Details and quirks]

## Event Metadata Example
```ics
BEGIN:VEVENT
[sample event]
END:VEVENT
```

## Update Behavior
[Details]

## Known Issues
- Issue 1
- Issue 2

## Resources
- Documentation: [URL]
- Help articles: [URL]
- Community discussions: [URL]

## Integration Recommendations
What we should implement to support this platform well

---
```

### Additional Context

**Our Use Case:**
- Aggregating multiple team calendars for families with kids on different teams
- Detecting duplicate events across feeds
- Highlighting when game times/locations change
- Filtering game events vs practices/meetings
- Primarily youth sports (ages 5-18)
- Focus on baseball/softball initially (GameChanger)

**Technical Constraints:**
- Polling-based (no webhooks)
- Must respect rate limits
- Need to detect when feeds go stale or return errors
- Must handle partial failures gracefully

**Questions to Prioritize:**
1. What's the safest polling frequency that won't get us throttled?
2. How do we reliably detect rescheduled games (time/location changes)?
3. Are there common pitfalls when parsing their ICS format?
4. Do they have any undocumented behaviors we should know about?

### Research Tips

- Check their official documentation and help centers
- Search GitHub for projects that integrate with these platforms
- Look for forum posts, Reddit discussions (r/baseball, r/softball, etc.)
- Check Stack Overflow for questions about their feeds
- Try web searches like "[Platform] ICS feed problems"
- Look for third-party integration platforms (Zapier, IFTTT) that connect to them

---

## How to Use This Research

Once you've gathered this information:

1. Create a new file: `PLATFORM_INTEGRATION_NOTES.md`
2. Paste your research findings
3. Return to Claude Code and say: "I've completed the platform research, see PLATFORM_INTEGRATION_NOTES.md"
4. I'll review and implement platform-specific handling based on your findings

---

## Quick Start (If You Have GameChanger Access)

If you already use GameChanger, the fastest way to help:

1. Log into your GameChanger account
2. Navigate to your team's schedule
3. Look for "Export" or "Subscribe" options
4. Copy the ICS feed URL (if visible)
5. Download a sample .ics file
6. Share the URL pattern and file content (with sensitive info redacted)

Even just a sample ICS file will help us understand their format!

---

## Example Output (Template)

Here's what good research output looks like:

```markdown
# GameChanger

## Overview
Mobile-first baseball/softball scoring and team management app. Focus on game streaming and stats tracking, with scheduling as secondary feature.

## Calendar Feed Access
- Available from: Team Schedule → Share → "Subscribe in Calendar App"
- Public feed URL: https://gc.com/teams/{teamId}/schedule.ics?token={token}
- Token appears to be long-lived (>1 year)
- URL visible in share sheet, copyable

## Authentication
- URL token-based: ?token=abc123xyz...
- Token embedded in URL, no separate auth
- Tokens appear to be tied to team+season
- No expiration observed in community discussions
- No rate limit on token generation

## Rate Limits
- Not officially documented
- Community reports: No throttling observed with hourly polls
- One report of 429 errors with 5-minute polling
- **Recommendation: Poll every 15-30 minutes**

[etc...]
```

---

## Timeline

**Suggested approach:**
- Spend 2-3 hours on this research
- Focus on GameChanger first (30-60 min)
- Then top 4-5 other platforms (20-30 min each)
- Document even partial findings
- We can always research more later as needed

The goal is to gather enough information to make smart implementation decisions, not perfect documentation.
