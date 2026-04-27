import { InvocationContext } from "@azure/functions";

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogCategory = "refresh" | "feed" | "publish" | "api" | "merge" | "filter" | "system";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: Record<string, unknown>;
  refreshId?: string;
  requestId?: string;
}

export interface Logger {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
  debug(message: string, details?: Record<string, unknown>): void;
  withContext(refreshId?: string, requestId?: string): Logger;
  setCategory(category: LogCategory): Logger;
}

interface LoggerContext {
  category: LogCategory;
  refreshId?: string;
  requestId?: string;
}

export function createLogger(invocationContext?: InvocationContext, initialContext?: Partial<LoggerContext>): Logger {
  const sink = invocationContext ? invocationContext.log.bind(invocationContext) : console.log;
  const logContext: LoggerContext = {
    category: initialContext?.category ?? "system",
    refreshId: initialContext?.refreshId,
    requestId: initialContext?.requestId,
  };

  function write(level: LogLevel, message: string, details?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: logContext.category,
      message,
      context: details,
      refreshId: logContext.refreshId,
      requestId: logContext.requestId,
    };

    const payload = JSON.stringify(entry);
    sink(payload);
  }

  return {
    info: (message, details) => write("info", message, details),
    warn: (message, details) => write("warn", message, details),
    error: (message, details) => write("error", message, details),
    debug: (message, details) => write("debug", message, details),
    withContext: (refreshId, requestId) => {
      return createLogger(invocationContext, {
        ...logContext,
        refreshId: refreshId ?? logContext.refreshId,
        requestId: requestId ?? logContext.requestId,
      });
    },
    setCategory: (category) => {
      return createLogger(invocationContext, {
        ...logContext,
        category,
      });
    },
  };
}
