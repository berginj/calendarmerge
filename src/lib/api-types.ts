/**
 * API Contract Types
 *
 * This file contains all request and response type definitions for the HTTP API.
 * These types define the public contract between clients and the service.
 *
 * See DESIGN_CONTRACTS.md for the authoritative API response format specification.
 */

import { SourceFeedConfig, ServiceStatus, FeedStatus, OutputPaths } from "./types";

// ============================================================================
// Standard Response Envelopes
// ============================================================================

/**
 * Standard success response envelope
 * ALL successful API responses MUST use this structure
 */
export interface SuccessResponse<T> {
  requestId: string;
  status: "success";
  data: T;
  message?: string;
  metadata?: ResponseMetadata;
}

/**
 * Standard partial success response envelope
 * Used when operation partially succeeded with warnings
 */
export interface PartialSuccessResponse<T> {
  requestId: string;
  status: "partial-success";
  data: T;
  warnings: string[];
  message?: string;
  metadata?: ResponseMetadata;
}

/**
 * Standard error response envelope
 * ALL error responses MUST use this structure
 */
export interface ErrorResponse {
  requestId: string;
  status: "error";
  error: ErrorDetail;
}

export interface ErrorDetail {
  code: string;                              // Machine-readable error code
  message: string;                           // Human-readable message
  details?: string;                          // Optional technical details
  validationErrors?: Record<string, string[]>; // Field-specific validation errors
}

export interface ResponseMetadata {
  refreshId?: string;
  operationDuration?: number;
  affectedResources?: string[];
}

// ============================================================================
// Error Codes (Machine-Readable)
// ============================================================================

export const ERROR_CODES = {
  // Client Errors (4xx)
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",

  // Server Errors (5xx)
  INTERNAL_ERROR: "INTERNAL_ERROR",
  STORAGE_ERROR: "STORAGE_ERROR",
  FEED_FETCH_ERROR: "FEED_FETCH_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ============================================================================
// Request Types
// ============================================================================

/**
 * Create feed request
 * POST /api/feeds
 */
export interface CreateFeedRequest {
  id?: string;        // Optional - auto-generated if not provided (pattern: ^[a-z0-9-]+$)
  name: string;       // Required - non-empty, max 100 chars
  url: string;        // Required - valid HTTP/HTTPS/webcal URL
  enabled?: boolean;  // Optional - defaults to true
}

/**
 * Update feed request
 * PUT /api/feeds/{id}
 */
export interface UpdateFeedRequest {
  name?: string;      // Optional - non-empty if provided
  url?: string;       // Optional - valid URL if provided, triggers validation
  enabled?: boolean;  // Optional - boolean if provided
}

/**
 * Update settings request
 * PUT /api/settings
 */
export interface UpdateSettingsRequest {
  refreshSchedule?: "every-15-min" | "hourly" | "every-2-hours" | "business-hours" | "manual-only";
}

// ============================================================================
// Response Data Types
// ============================================================================

/**
 * Feed response data
 * Used in feed create, update, and get operations
 */
export interface FeedResponseData {
  feed: SourceFeedConfig;
}

/**
 * Feed list response data
 * Used in list feeds operation
 */
export interface FeedListResponseData {
  feeds: SourceFeedConfig[];
  count: number;
}

/**
 * Feed validation details
 * Included in feed update response when validation occurs
 */
export interface FeedValidationDetails {
  eventCount: number;
  detectedPlatform?: string;
  warnings?: string[];
  eventDateRange?: {
    earliest: string;
    latest: string;
  };
  sampleEvents?: string[];
}

/**
 * Feed update response data
 * Includes validation details when URL was validated
 */
export interface FeedUpdateResponseData {
  feed: SourceFeedConfig;
  validated: boolean;
  validationDetails?: FeedValidationDetails;
  refreshTriggered: boolean;
}

/**
 * Settings response data
 */
export interface SettingsResponseData {
  settings: {
    refreshSchedule: string;
  };
}

/**
 * Manual refresh response data
 * Contains comprehensive refresh results
 */
export interface RefreshResponseData {
  refreshId: string;
  operationalState: "healthy" | "degraded" | "failed";
  degradationReasons?: string[];

  // Event counts
  eventCount: number;
  gamesOnlyEventCount: number;
  candidateEventCount: number;

  // Publishing status
  calendarPublished: boolean;
  gamesOnlyCalendarPublished: boolean;
  servedLastKnownGood: boolean;

  // Timestamps
  lastAttemptedRefresh: string;
  lastSuccessfulRefresh?: string;
  lastSuccessfulCheck?: {
    fullCalendar?: string;
    gamesCalendar?: string;
    combined?: string;
  };
  checkAgeHours?: {
    fullCalendar?: number;
    gamesCalendar?: number;
  };

  // Feed details
  sourceStatuses: FeedStatus[];
  feedChangeAlerts?: any[];
  suspectFeeds?: string[];

  // Event insights
  potentialDuplicates?: any[];
  rescheduledEvents?: any[];
  cancelledEventsFiltered?: number;

  // Output
  output: OutputPaths;
  errorSummary: string[];

  // Legacy compatibility
  state: "starting" | "success" | "partial" | "failed";
  healthy: boolean;
}

// ============================================================================
// Validation Result Type
// ============================================================================

/**
 * Standard validation result
 * MUST be used by all validation functions
 */
export type ValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors: Record<string, string[]> };

// ============================================================================
// Helper Types for Response Construction
// ============================================================================

/**
 * Helper to construct success responses
 */
export function createSuccessResponse<T>(
  requestId: string,
  data: T,
  message?: string,
  metadata?: ResponseMetadata,
): SuccessResponse<T> {
  return {
    requestId,
    status: "success",
    data,
    message,
    metadata,
  };
}

/**
 * Helper to construct partial success responses
 */
export function createPartialSuccessResponse<T>(
  requestId: string,
  data: T,
  warnings: string[],
  message?: string,
  metadata?: ResponseMetadata,
): PartialSuccessResponse<T> {
  return {
    requestId,
    status: "partial-success",
    data,
    warnings,
    message,
    metadata,
  };
}

/**
 * Helper to construct error responses
 */
export function createErrorResponse(
  requestId: string,
  code: ErrorCode,
  message: string,
  details?: string,
  validationErrors?: Record<string, string[]>,
): ErrorResponse {
  return {
    requestId,
    status: "error",
    error: {
      code,
      message,
      details,
      validationErrors,
    },
  };
}

/**
 * Helper to convert ErrorResponse to HttpResponseInit
 */
export function toHttpResponse<T>(
  response: SuccessResponse<T> | PartialSuccessResponse<T> | ErrorResponse,
  httpStatus?: number,
): { status: number; jsonBody: any } {
  if (response.status === "error") {
    const statusCode = httpStatus ?? getHttpStatusForErrorCode(response.error.code);
    return {
      status: statusCode,
      jsonBody: response,
    };
  }

  return {
    status: httpStatus ?? 200,
    jsonBody: response,
  };
}

/**
 * Maps error codes to HTTP status codes
 */
function getHttpStatusForErrorCode(code: string): number {
  switch (code) {
    case ERROR_CODES.VALIDATION_ERROR:
    case ERROR_CODES.INVALID_REQUEST:
      return 400;
    case ERROR_CODES.NOT_FOUND:
      return 404;
    case ERROR_CODES.CONFLICT:
      return 409;
    case ERROR_CODES.SERVICE_UNAVAILABLE:
      return 503;
    default:
      return 500;
  }
}
