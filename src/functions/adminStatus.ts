import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { BlobStore } from "../lib/blobStore";
import { buildAdminUnauthorizedResponse, verifyAdminSession } from "../lib/adminSession";
import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { buildAdminStatus, buildStartingStatus } from "../lib/status";
import { errorMessage, generateId } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";

app.http("adminStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "status/internal",
  handler: adminStatusHandler,
});

export async function adminStatusHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const config = getConfig();
    if (!verifyAdminSession(request, config)) {
      return buildAdminUnauthorizedResponse(requestId);
    }
    const store = new BlobStore(config);
    const status = (await store.readStatusForRefresh()) ?? buildStartingStatus(config);
    const adminStatus = buildAdminStatus(status);

    logger.info("admin_status_retrieved", {
      requestId,
      refreshId: adminStatus.refreshId,
      operationalState: adminStatus.operationalState,
    });

    return toHttpResponse(createSuccessResponse(requestId, { status: adminStatus }));
  } catch (error) {
    logger.error("admin_status_failed", { requestId, error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(
        requestId,
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to load admin status",
        errorMessage(error),
      ),
    );
  }
}
