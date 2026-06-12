import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { HttpRequest } from "@azure/functions";
import type { HttpResponseInit } from "@azure/functions";

import { createErrorResponse, ERROR_CODES, toHttpResponse } from "./api-types";
import type { AppConfig } from "./types";

export const ADMIN_SESSION_COOKIE_NAME = "calendarmerge_admin_session";

interface AdminSessionPayload {
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export function isAdminAuthConfigured(config: AppConfig): boolean {
  return Boolean(config.adminAccessCode?.trim());
}

export function verifyAdminSession(request: HttpRequest, config: AppConfig): boolean {
  const secret = config.adminAccessCode?.trim();
  if (!secret) {
    return false;
  }

  const cookieHeader = request.headers.get("cookie") ?? request.headers.get("Cookie") ?? "";
  const token = readCookie(cookieHeader, ADMIN_SESSION_COOKIE_NAME);
  if (!token) {
    return false;
  }

  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) {
    return false;
  }

  const expectedSignature = signPayload(payloadB64, secret);
  if (!signaturesMatch(signatureB64, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as AdminSessionPayload;
    return Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function verifyCsrfHeader(request: HttpRequest): boolean {
  return request.headers.get("x-requested-with") === "XMLHttpRequest";
}

export function buildAdminUnauthorizedResponse(requestId: string, message = "Admin session required"): HttpResponseInit {
  return toHttpResponse(
    createErrorResponse(requestId, ERROR_CODES.UNAUTHORIZED, message),
    401,
  );
}

export function createAdminSessionCookieValue(config: AppConfig): string {
  const secret = config.adminAccessCode?.trim();
  if (!secret) {
    throw new Error("ADMIN_ACCESS_CODE is not configured.");
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + config.adminSessionTtlHours * 60 * 60 * 1000;
  const payload: AdminSessionPayload = {
    issuedAt,
    expiresAt,
    nonce: randomBytes(16).toString("hex"),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signatureB64 = signPayload(payloadB64, secret);
  return `${payloadB64}.${signatureB64}`;
}

export function buildAdminSessionSetCookie(config: AppConfig): string {
  const value = createAdminSessionCookieValue(config);
  const maxAge = Math.max(0, Math.floor(config.adminSessionTtlHours * 60 * 60));
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAge}`,
    config.adminCookieSecure ? "SameSite=None" : "SameSite=Lax",
  ];

  if (config.adminCookieSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildClearedAdminSessionCookie(config: AppConfig): string {
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    config.adminCookieSecure ? "SameSite=None" : "SameSite=Lax",
  ];

  if (config.adminCookieSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return rest.join("=");
    }
  }

  return undefined;
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
