import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";
import { getConfig } from "../lib/config";
import {
  buildAdminSessionSetCookie,
  buildClearedAdminSessionCookie,
  isAdminAuthConfigured,
  verifyAdminSession,
} from "../lib/adminSession";
import { createLogger } from "../lib/log";
import { errorMessage, generateId } from "../lib/util";

interface AdminSessionLoginRequest {
  accessCode?: string;
}

app.http("adminSession", {
  methods: ["GET", "POST", "DELETE"],
  authLevel: "anonymous",
  route: "admin/session",
  handler: adminSessionHandler,
});

export async function adminSessionHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");
  const config = getConfig();

  try {
    if (request.method === "GET") {
      return toHttpResponse(
        createSuccessResponse(requestId, {
          authenticated: verifyAdminSession(request, config),
          configured: isAdminAuthConfigured(config),
        }),
      );
    }

    if (request.method === "DELETE") {
      logger.info("admin_session_cleared", { requestId });
      return {
        ...toHttpResponse(createSuccessResponse(requestId, { authenticated: false }, "Admin session cleared")),
        headers: {
          "Set-Cookie": buildClearedAdminSessionCookie(config),
        },
      };
    }

    if (!isAdminAuthConfigured(config)) {
      return toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.SERVICE_UNAVAILABLE,
          "Admin authentication is not configured",
        ),
        503,
      );
    }

    let body: AdminSessionLoginRequest;
    try {
      body = (await request.json()) as AdminSessionLoginRequest;
    } catch (error) {
      return toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.INVALID_REQUEST,
          "Request body must be valid JSON",
          errorMessage(error),
        ),
      );
    }

    const accessCode = body.accessCode?.trim();
    if (!accessCode) {
      return toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.VALIDATION_ERROR,
          "Admin access code is required",
          undefined,
          { accessCode: ["Admin access code must be a non-empty string"] },
        ),
      );
    }

    if (accessCode !== config.adminAccessCode?.trim()) {
      return toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.UNAUTHORIZED,
          "Admin access code is invalid",
        ),
        401,
      );
    }

    logger.info("admin_session_created", { requestId });
    return {
      ...toHttpResponse(
        createSuccessResponse(requestId, { authenticated: true }, "Admin session started"),
      ),
      headers: {
        "Set-Cookie": buildAdminSessionSetCookie(config),
      },
    };
  } catch (error) {
    logger.error("admin_session_failed", { requestId, error: errorMessage(error) });
    return toHttpResponse(
      createErrorResponse(
        requestId,
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to manage admin session",
        errorMessage(error),
      ),
    );
  }
}
