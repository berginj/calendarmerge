import type { HttpRequest, HttpResponseInit } from "@azure/functions";

import {
  createErrorResponse,
  ERROR_CODES,
  ErrorCode,
  toHttpResponse,
  ValidationResult,
} from "./api-types";
import { errorMessage } from "./util";

export type RequestJsonResult =
  | { valid: true; data: Record<string, unknown> }
  | {
      valid: false;
      code: ErrorCode;
      message: string;
      errors: Record<string, string[]>;
    };

export async function parseJsonObjectRequest(request: HttpRequest): Promise<RequestJsonResult> {
  let data: unknown;

  try {
    data = await request.json();
  } catch (error) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_REQUEST,
      message: "Malformed JSON request body",
      errors: {
        body: [`Request body must be valid JSON: ${errorMessage(error)}`],
      },
    };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Validation failed",
      errors: {
        body: ["Request body must be a JSON object"],
      },
    };
  }

  return {
    valid: true,
    data: data as Record<string, unknown>,
  };
}

export function validationErrorResponse(
  requestId: string,
  message: string,
  errors: Record<string, string[]>,
  code: ErrorCode = ERROR_CODES.VALIDATION_ERROR,
): HttpResponseInit {
  return toHttpResponse(
    createErrorResponse(
      requestId,
      code,
      message,
      flattenValidationErrors(errors),
      errors,
    ),
  );
}

export function flattenValidationErrors(errors: Record<string, string[]>): string {
  return Object.values(errors).flat().join("; ");
}

export function fieldError(errors: Record<string, string[]>, field: string, message: string): void {
  errors[field] = [...(errors[field] ?? []), message];
}

export function valid<T>(data: T): ValidationResult<T> {
  return { valid: true, data };
}

export function invalid<T = never>(errors: Record<string, string[]>): ValidationResult<T> {
  return { valid: false, errors };
}
