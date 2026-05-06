import { AppConfig, FeedRunResult, SourceFeedConfig } from "./types";
import { parseIcsCalendar } from "./ics";
import { Logger } from "./log";
import { errorMessage, FeedDnsLookup, normalizeFeedUrl, redactFeedUrl, sleep, validateFeedUrlTarget } from "./util";

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
const MAX_REDIRECTS = 5;

export interface FetchFeedTextOptions {
  lookupAddress?: FeedDnsLookup;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
}

export async function fetchFeedText(
  url: string,
  timeoutMs: number,
  options: FetchFeedTextOptions = {},
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  const lookupAddress = options.lookupAddress;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_ICS_SIZE_BYTES;

  try {
    let currentUrl = await validateFeedUrlTarget(url, lookupAddress);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
        },
      });

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Feed redirect returned HTTP ${response.status} without a Location header.`);
        }

        currentUrl = await validateFeedUrlTarget(new URL(location, currentUrl).toString(), lookupAddress);
        continue;
      }

      if (!response.ok) {
        throw new HttpStatusError(response.status, `Feed request returned HTTP ${response.status}.`);
      }

      // SECURITY: Check content-length before downloading
      const contentLength = response.headers.get("content-length");
      const parsedContentLength = contentLength ? Number.parseInt(contentLength, 10) : undefined;
      if (parsedContentLength && parsedContentLength > maxBytes) {
        throw new Error(`Feed too large: ${parsedContentLength} bytes (max ${maxBytes})`);
      }

      return readResponseTextWithLimit(response, maxBytes);
    }

    throw new Error(`Feed followed too many redirects (max ${MAX_REDIRECTS}).`);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Feed request timed out after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

async function readResponseTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new Error(`Feed content exceeds size limit (${buffer.byteLength} bytes)`);
    }

    return buffer.toString("utf8");
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`Feed content exceeds size limit (${totalBytes} bytes)`);
      }

      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes).toString("utf8");
}
