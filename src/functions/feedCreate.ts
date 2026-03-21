import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { TableStore } from "../lib/tableStore";
import { errorMessage, getStorageConnectionString } from "../lib/util";

app.http("createFeed", {
  methods: ["POST"],
  authLevel: "function",
  route: "feeds",
  handler: createFeedHandler,
});

interface CreateFeedRequest {
  id?: string;
  name: string;
  url: string;
}

async function createFeedHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const logger = createLogger(context);

  try {
    const body = (await request.json()) as CreateFeedRequest;

    // Validate input
    const validation = validateFeedInput(body);
    if (!validation.valid) {
      logger.warn("feed_create_validation_failed", { errors: validation.errors });

      return {
        status: 400,
        jsonBody: {
          error: "Validation failed",
          details: validation.errors,
        },
      };
    }

    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const store = new TableStore(connectionString);

    // Generate ID if not provided
    const feedId = body.id || TableStore.generateFeedId(body.url);

    // Check for duplicate ID
    const existing = await store.getFeed(feedId);
    if (existing) {
      logger.warn("feed_create_duplicate_id", { feedId });

      return {
        status: 409,
        jsonBody: {
          error: "Feed ID already exists",
          feedId,
        },
      };
    }

    // Create feed
    const entity = await store.createFeed({
      partitionKey: "default",
      rowKey: feedId,
      id: feedId,
      name: body.name.trim(),
      url: body.url.trim(),
      enabled: true,
    });

    logger.info("feed_created", { feedId, name: body.name });

    return {
      status: 201,
      jsonBody: {
        feed: {
          id: entity.id,
          name: entity.name,
          url: entity.url,
        },
        message: "Feed created successfully",
      },
    };
  } catch (error) {
    logger.error("feed_create_failed", { error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: { error: "Failed to create feed" },
    };
  }
}

function validateFeedInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    errors.push("Request body must be a JSON object");
    return { valid: false, errors };
  }

  const body = input as Partial<CreateFeedRequest>;

  // Validate name
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    errors.push("Feed name is required and must be a non-empty string");
  }

  // Validate URL
  if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
    errors.push("Feed URL is required and must be a non-empty string");
  } else {
    try {
      const url = new URL(body.url);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push("Feed URL must use http or https protocol");
      }
    } catch {
      errors.push("Feed URL is not a valid URL");
    }
  }

  // Validate ID if provided
  if (body.id !== undefined) {
    if (typeof body.id !== "string" || !body.id.trim()) {
      errors.push("Feed ID must be a non-empty string if provided");
    } else if (!/^[a-z0-9-]+$/.test(body.id)) {
      errors.push("Feed ID must contain only lowercase letters, numbers, and hyphens");
    }
  }

  return { valid: errors.length === 0, errors };
}
