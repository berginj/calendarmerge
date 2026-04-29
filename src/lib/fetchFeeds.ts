import { AppConfig, FeedRunResult, SourceFeedConfig } from "./types";
import { parseIcsCalendar } from "./ics";
import { Logger } from "./log";
import { errorMessage, normalizeFeedUrl, redactFeedUrl, sleep } from "./util";

class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchFeed(source: SourceFeedConfig, config: AppConfig, logger: Logger): Promise<FeedRunResult> {
  const startedAt = Date.now();
  const attemptedAt = new Date().toISOString();
  let lastError = "Unknown error";
  let httpStatus: number | undefined;

  for (let attempt = 0; attempt <= config.fetchRetryCount; attempt += 1) {
    try {
      const text = await fetchFeedText(source.url, config.fetchTimeoutMs);
      const events = parseIcsCalendar(text, source);

      logger.info("feed_fetch_succeeded", {
        sourceId: source.id,
        sourceUrl: redactFeedUrl(source.url),
        attempt: attempt + 1,
        eventCount: events.length,
      });

      return {
        source,
        status: {
          id: source.id,
          name: source.name,
          url: redactFeedUrl(source.url),
          ok: true,
          attemptedAt,
          durationMs: Date.now() - startedAt,
          eventCount: events.length,
        },
        events,
      };
    } catch (error) {
      lastError = errorMessage(error);
      httpStatus = error instanceof HttpStatusError ? error.status : httpStatus;

      logger.warn("feed_fetch_failed_attempt", {
        sourceId: source.id,
        sourceUrl: redactFeedUrl(source.url),
        attempt: attempt + 1,
        error: lastError,
        httpStatus,
      });

      if (attempt < config.fetchRetryCount) {
        await sleep(config.fetchRetryDelayMs * (attempt + 1));
      }
    }
  }

  return {
    source,
    status: {
      id: source.id,
      name: source.name,
      url: redactFeedUrl(source.url),
      ok: false,
      attemptedAt,
      durationMs: Date.now() - startedAt,
      eventCount: 0,
      httpStatus,
      error: lastError,
    },
    events: [],
  };
}

// SECURITY: Maximum ICS file size to prevent DoS attacks (10MB)
const MAX_ICS_SIZE_BYTES = 10 * 1024 * 1024;

async function fetchFeedText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    const response = await fetch(normalizeFeedUrl(url), {
      signal: controller.signal,
      headers: {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
      },
    });

    if (!response.ok) {
      throw new HttpStatusError(response.status, `Feed request returned HTTP ${response.status}.`);
    }

    // SECURITY: Check content-length before downloading
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_ICS_SIZE_BYTES) {
      throw new Error(`Feed too large: ${contentLength} bytes (max ${MAX_ICS_SIZE_BYTES})`);
    }

    const text = await response.text();

    // SECURITY: Verify actual size even if content-length not provided
    if (text.length > MAX_ICS_SIZE_BYTES) {
      throw new Error(`Feed content exceeds size limit (${text.length} bytes)`);
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Feed request timed out after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
