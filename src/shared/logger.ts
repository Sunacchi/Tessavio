import type { ErrorCode } from "./errors";

type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  readonly correlationId?: string;
  readonly jobId?: string;
  readonly updateId?: number;
  readonly state?: string;
  readonly errorCode?: ErrorCode;
  readonly latencyMs?: number;
  readonly attempt?: number;
}

export function logEvent(
  level: LogLevel,
  event: string,
  context: LogContext = {},
): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  });

  if (level === "error") {
    console.error(record);
  } else if (level === "warn") {
    console.warn(record);
  } else {
    console.log(record);
  }
}
