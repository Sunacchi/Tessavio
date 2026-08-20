import { Temporal } from "@js-temporal/polyfill";

export const baseReportPolicyVersion = "base-report-v1";
export const baseReportContributorLimit = 500;
export const baseReportMaxDays = 366;
export const baseReportMaxCsvBytes = 5_000_000;

export interface BaseReportWindow {
  readonly startDate: string;
  readonly endDate: string;
  readonly civilDayCount: number;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
  readonly timeZone: string;
}

export type BaseReportValidationIssue =
  "date" | "range_order" | "range_duration" | "time_zone";

export type BaseReportValidationResult =
  | { readonly ok: true; readonly value: BaseReportWindow }
  | { readonly ok: false; readonly issue: BaseReportValidationIssue };

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

function parseDate(value: string): Temporal.PlainDate | null {
  if (!localDatePattern.test(value)) return null;
  try {
    const parsed = Temporal.PlainDate.from(value, { overflow: "reject" });
    return parsed.toString() === value ? parsed : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function baseReportWindow(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly timeZone: string;
}): BaseReportValidationResult {
  const startDate = parseDate(input.startDate.trim());
  const endDate = parseDate(input.endDate.trim());
  if (startDate === null || endDate === null) {
    return { ok: false, issue: "date" };
  }
  const difference = startDate.until(endDate, { largestUnit: "day" }).days;
  if (difference < 0) return { ok: false, issue: "range_order" };
  const civilDayCount = difference + 1;
  if (civilDayCount > baseReportMaxDays) {
    return { ok: false, issue: "range_duration" };
  }
  try {
    const start = startDate.toZonedDateTime({
      timeZone: input.timeZone,
      plainTime: "00:00",
    });
    const end = endDate.add({ days: 1 }).toZonedDateTime({
      timeZone: input.timeZone,
      plainTime: "00:00",
    });
    return {
      ok: true,
      value: {
        startDate: startDate.toString(),
        endDate: endDate.toString(),
        civilDayCount,
        startAtUtc: new Date(start.epochMilliseconds),
        endAtUtc: new Date(end.epochMilliseconds),
        timeZone: input.timeZone,
      },
    };
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, issue: "time_zone" };
    throw error;
  }
}

function safeCsvValue(value: string): string {
  const sanitized = value.replaceAll("\0", "");
  if (/^-?\d+(?:\.\d+)?$/u.test(sanitized)) return sanitized;
  return /^[=+\-@]/u.test(sanitized) ? `'${sanitized}` : sanitized;
}

export function renderCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row
        .map((value) => `"${safeCsvValue(value).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\r\n");
}
