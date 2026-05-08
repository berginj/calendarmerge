import { AlertDedupeStore } from "./alertDedupeStore";
import { AppConfig, ServiceStatus } from "./types";
import { errorMessage, getStorageConnectionString, sha256Hex } from "./util";
import type { Logger } from "./log";

export type OperationalAlertKind =
  | "service-failed"
  | "stale-calendar"
  | "feed-events-to-zero"
  | "feed-significant-drop"
  | "reschedule-detected"
  | "repeated-feed-failure";

export interface OperationalAlert {
  key: string;
  kind: OperationalAlertKind;
  severity: "info" | "warning" | "error";
  title: string;
  details: string;
  feedId?: string;
  feedName?: string;
  eventSummary?: string;
}

interface AlertPayload {
  serviceName: string;
  refreshId?: string;
  generatedAt: string;
  operationalState?: string;
  statusUrl?: string;
  alerts: OperationalAlert[];
}

export async function deliverOperationalAlerts(
  status: ServiceStatus,
  config: AppConfig,
  logger: Logger,
): Promise<void> {
  if (!config.alertWebhookUrl) {
    return;
  }

  const alerts = collectOperationalAlerts(status, config);
  if (alerts.length === 0) {
    return;
  }

  try {
    const store = new AlertDedupeStore(getStorageConnectionString(config.outputStorageAccount));
    const dueKeys = new Set(await store.filterDueKeys(
      alerts.map((alert) => alert.key),
      config.alertDedupeCooldownMinutes,
    ));
    const dueAlerts = alerts.filter((alert) => dueKeys.has(alert.key));

    if (dueAlerts.length === 0) {
      logger.info("alerts_suppressed_by_dedupe", { candidateCount: alerts.length });
      return;
    }

    const response = await fetch(config.alertWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildAlertPayload(status, dueAlerts)),
    });

    if (!response.ok) {
      logger.warn("alert_webhook_failed", {
        status: response.status,
        statusText: response.statusText,
        alertCount: dueAlerts.length,
      });
      return;
    }

    await store.recordSent(dueAlerts.map((alert) => alert.key));
    logger.info("alerts_delivered", { alertCount: dueAlerts.length });
  } catch (error) {
    logger.warn("alert_delivery_failed", { error: errorMessage(error) });
  }
}

export function collectOperationalAlerts(status: ServiceStatus, config: AppConfig): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  if (status.operationalState === "failed") {
    alerts.push(buildAlert(
      "service-failed",
      "error",
      "Calendar Merge failed",
      (status.degradationReasons ?? status.errorSummary).join("; ") || "Service entered failed state.",
    ));
  }

  const calendarAges = [
    { label: "Full calendar", key: "full", age: status.checkAgeHours?.fullCalendar },
    { label: "Games calendar", key: "games", age: status.checkAgeHours?.gamesCalendar },
  ];
  for (const calendar of calendarAges) {
    if (calendar.age !== undefined && calendar.age >= config.alertStaleHours) {
      alerts.push(buildAlert(
        "stale-calendar",
        "warning",
        `${calendar.label} is stale`,
        `${calendar.label} has not updated in ${Math.round(calendar.age * 10) / 10} hours.`,
        calendar.key,
      ));
    }
  }

  for (const alert of status.feedChangeAlerts ?? []) {
    if (alert.change === "events-to-zero" || alert.change === "significant-drop") {
      alerts.push(buildAlert(
        alert.change === "events-to-zero" ? "feed-events-to-zero" : "feed-significant-drop",
        alert.severity === "error" ? "error" : "warning",
        `${alert.feedName}: ${alert.change.replace(/-/g, " ")}`,
        `${alert.previousCount} to ${alert.currentCount} events (${alert.percentChange > 0 ? "+" : ""}${alert.percentChange}%).`,
        alert.feedId,
        { feedId: alert.feedId, feedName: alert.feedName },
      ));
    }
  }

  for (const feed of status.sourceStatuses) {
    if (!feed.ok && (feed.consecutiveFailures ?? 0) >= config.alertConsecutiveFailureThreshold) {
      alerts.push(buildAlert(
        "repeated-feed-failure",
        "error",
        `${feed.name} has repeated failures`,
        `${feed.consecutiveFailures} consecutive failures. Latest error: ${feed.error ?? "Unknown error"}.`,
        feed.id,
        { feedId: feed.id, feedName: feed.name },
      ));
    }
  }

  for (const event of status.rescheduledEvents ?? []) {
    alerts.push(buildAlert(
      "reschedule-detected",
      "info",
      `Schedule changed: ${event.summary}`,
      describeEventChange(event.changes),
      event.uid,
      { feedId: event.feedId, feedName: event.feedName, eventSummary: event.summary },
    ));
  }

  return dedupeAlerts(alerts);
}

function buildAlert(
  kind: OperationalAlertKind,
  severity: OperationalAlert["severity"],
  title: string,
  details: string,
  discriminator = "",
  extras: Partial<OperationalAlert> = {},
): OperationalAlert {
  const stableKey = sha256Hex(`${kind}:${title}:${discriminator}`).slice(0, 32);
  return {
    key: stableKey,
    kind,
    severity,
    title,
    details,
    ...extras,
  };
}

function buildAlertPayload(status: ServiceStatus, alerts: OperationalAlert[]): AlertPayload {
  return {
    serviceName: status.serviceName,
    refreshId: status.refreshId,
    generatedAt: new Date().toISOString(),
    operationalState: status.operationalState,
    statusUrl: status.output?.blobStatusUrl,
    alerts,
  };
}

function describeEventChange(changes: { time?: { from: string; to: string }; location?: { from: string; to: string } }): string {
  const parts: string[] = [];
  if (changes.time) {
    parts.push(`time changed from ${changes.time.from} to ${changes.time.to}`);
  }
  if (changes.location) {
    parts.push(`location changed from ${changes.location.from || "none"} to ${changes.location.to || "none"}`);
  }

  return parts.join("; ") || "Event details changed.";
}

function dedupeAlerts(alerts: OperationalAlert[]): OperationalAlert[] {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    if (seen.has(alert.key)) {
      return false;
    }

    seen.add(alert.key);
    return true;
  });
}
