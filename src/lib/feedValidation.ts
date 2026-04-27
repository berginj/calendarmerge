import { Logger } from "./log";
import { fetchFeed } from "./fetchFeeds";
import { AppConfig, SourceFeedConfig } from "./types";

export interface FeedValidationResult {
  valid: boolean;
  eventCount: number;
  error?: string;
  httpStatus?: number;
  eventDateRange?: {
    earliest: string;
    latest: string;
  };
  sampleEvents?: string[];
  detectedPlatform?: string;
  warnings?: string[];
}

/**
 * Validates a feed by attempting to fetch and parse it.
 * Returns validation details for user feedback.
 */
export async function validateFeed(
  feedConfig: SourceFeedConfig,
  config: AppConfig,
  logger: Logger,
): Promise<FeedValidationResult> {
  const validationLogger = logger.setCategory("feed");

  try {
    const result = await fetchFeed(feedConfig, config, validationLogger);

    if (!result.status.ok) {
      return {
        valid: false,
        eventCount: 0,
        error: result.status.error,
        httpStatus: result.status.httpStatus,
      };
    }

    const warnings: string[] = [];
    const events = result.events;

    // Check for 0 events
    if (events.length === 0) {
      warnings.push("Feed returned 0 events - this may be expected during off-season");
    }

    // Check for future events
    const now = Date.now();
    const futureEvents = events.filter((e) => e.start.sortValue > now);
    if (futureEvents.length === 0 && events.length > 0) {
      warnings.push("Feed contains only past events - no upcoming events found");
    }

    // Get date range
    let eventDateRange: { earliest: string; latest: string } | undefined;
    if (events.length > 0) {
      const sortedEvents = [...events].sort((a, b) => a.start.sortValue - b.start.sortValue);
      eventDateRange = {
        earliest: sortedEvents[0].start.iso,
        latest: sortedEvents[sortedEvents.length - 1].start.iso,
      };
    }

    // Get sample event titles (max 5)
    const sampleEvents = events.slice(0, 5).map((e) => e.summary);

    // Detect platform from URL
    const detectedPlatform = detectPlatformFromUrl(feedConfig.url);

    return {
      valid: true,
      eventCount: events.length,
      eventDateRange,
      sampleEvents,
      detectedPlatform,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      eventCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Detects platform from feed URL based on domain patterns
 */
function detectPlatformFromUrl(url: string): string | undefined {
  const urlLower = url.toLowerCase();

  if (urlLower.includes("gc.com") || urlLower.includes("gamechanger")) {
    return "GameChanger";
  }
  if (urlLower.includes("teamsnap.com")) {
    return "TeamSnap";
  }
  if (urlLower.includes("sportsengine.com")) {
    return "SportsEngine";
  }
  if (urlLower.includes("leagueapps.com")) {
    return "LeagueApps";
  }
  if (urlLower.includes("teamlinkt.com")) {
    return "TeamLinkt";
  }
  if (urlLower.includes("sportsconnect") || urlLower.includes("stacksports")) {
    return "SportsConnect";
  }
  if (urlLower.includes("arbiter")) {
    return "ArbiterSports";
  }
  if (urlLower.includes("maxpreps")) {
    return "MaxPreps";
  }
  if (urlLower.includes("finalforms")) {
    return "FinalForms";
  }
  if (urlLower.includes("hudl")) {
    return "Hudl";
  }

  return undefined;
}
