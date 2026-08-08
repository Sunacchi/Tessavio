import { Temporal } from "@js-temporal/polyfill";

export const workUndoTtlMs = 15 * 60 * 1_000;
export const workListLimit = 50;
export const workReportMaxDays = 366;
export const workReportRecordLimit = 500;
export const workMaximumDurationMinutes = 48 * 60;
export const workReportPolicyVersion = "work-report-v1";

export type BreakTreatment = "paid" | "unpaid";

interface WorkRecordBase {
  readonly id: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkRuleRecord extends WorkRecordBase {
  readonly name: string;
  readonly breakTreatment: BreakTreatment;
}

interface TimedWorkRecord extends WorkRecordBase {
  readonly title: string;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
  readonly originalTimeZone: string;
}

export type PlannedShiftRecord = TimedWorkRecord;

export interface WorkLogRecord extends TimedWorkRecord {
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly ruleName: string;
  readonly breakTreatment: BreakTreatment;
}

export interface WorkBreakRecord extends WorkRecordBase {
  readonly workLogId: string;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
  readonly originalTimeZone: string;
}

export interface WorkRuleValues {
  readonly name: string;
  readonly breakTreatment: BreakTreatment;
}

export interface WorkIntervalValues {
  readonly title: string;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
  readonly originalTimeZone: string;
}

export interface WorkBreakValues {
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
  readonly originalTimeZone: string;
}

export interface WorkWindow {
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
  readonly timeZone: string;
}

export interface WorkReportWindow extends WorkWindow {
  readonly startDate: string;
  readonly endDate: string;
  readonly civilDayCount: number;
}

export interface WorkDayRecords {
  readonly plannedShifts: readonly PlannedShiftRecord[];
  readonly workLogs: readonly WorkLogRecord[];
  readonly breaks: readonly WorkBreakRecord[];
  readonly truncated: boolean;
  readonly plannedShiftsTruncated: boolean;
}

export interface WorkLogReportLine {
  readonly workLogId: string;
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly ruleName: string;
  readonly breakTreatment: BreakTreatment;
  readonly clippedStartAtUtc: Date;
  readonly clippedEndAtUtc: Date;
  readonly grossMinutes: number;
  readonly breakMinutes: number;
  readonly countedMinutes: number;
}

export interface WorkReport {
  readonly policyVersion: typeof workReportPolicyVersion;
  readonly window: WorkReportWindow;
  readonly plannedShifts: readonly PlannedShiftRecord[];
  readonly workLogs: readonly WorkLogRecord[];
  readonly breaks: readonly WorkBreakRecord[];
  readonly lines: readonly WorkLogReportLine[];
  readonly totals: {
    readonly scheduledMinutes: number;
    readonly actualGrossMinutes: number;
    readonly breakMinutes: number;
    readonly countedMinutes: number;
  };
}

export type WorkValidationIssue =
  | "name"
  | "break_treatment"
  | "title"
  | "date"
  | "date_time"
  | "ambiguous_local_time"
  | "time_zone"
  | "interval_order"
  | "duration"
  | "range_order"
  | "range_duration";

export type WorkValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: WorkValidationIssue };

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

function cleanText(value: string, maximumLength: number): string | null {
  const cleaned = value.trim();
  const hasControl = Array.from(cleaned).some((character) => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= 31 || point === 127);
  });
  return cleaned.length >= 1 && cleaned.length <= maximumLength && !hasControl
    ? cleaned
    : null;
}

function parseDate(value: string): Temporal.PlainDate | null {
  if (!localDatePattern.test(value)) return null;
  try {
    const date = Temporal.PlainDate.from(value, { overflow: "reject" });
    return date.toString() === value ? date : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function parseDateTime(value: string): Temporal.PlainDateTime | null {
  if (!localDateTimePattern.test(value)) return null;
  try {
    const dateTime = Temporal.PlainDateTime.from(value, { overflow: "reject" });
    return dateTime.toString({ smallestUnit: "minute" }) === value
      ? dateTime
      : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function resolveInstant(
  value: Temporal.PlainDateTime,
  timeZone: string,
): WorkValidationResult<Temporal.Instant> {
  try {
    return {
      ok: true,
      value: value
        .toZonedDateTime(timeZone, { disambiguation: "reject" })
        .toInstant(),
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    try {
      new Intl.DateTimeFormat("en", { timeZone }).format(0);
      return { ok: false, issue: "ambiguous_local_time" };
    } catch (timeZoneError) {
      if (timeZoneError instanceof RangeError) {
        return { ok: false, issue: "time_zone" };
      }
      throw timeZoneError;
    }
  }
}

export function validateWorkRule(input: {
  readonly name: string;
  readonly breakTreatment: string;
}): WorkValidationResult<WorkRuleValues> {
  const name = cleanText(input.name, 100);
  if (name === null) return { ok: false, issue: "name" };
  const treatment = input.breakTreatment.trim().toLowerCase();
  if (treatment !== "paid" && treatment !== "unpaid") {
    return { ok: false, issue: "break_treatment" };
  }
  return { ok: true, value: { name, breakTreatment: treatment } };
}

function validateInterval(input: {
  readonly startLocal: string;
  readonly endLocal: string;
  readonly timeZone: string;
}): WorkValidationResult<WorkBreakValues> {
  const start = parseDateTime(input.startLocal.trim());
  const end = parseDateTime(input.endLocal.trim());
  if (start === null || end === null) return { ok: false, issue: "date_time" };
  const startInstant = resolveInstant(start, input.timeZone);
  if (!startInstant.ok) return startInstant;
  const endInstant = resolveInstant(end, input.timeZone);
  if (!endInstant.ok) return endInstant;
  if (Temporal.Instant.compare(endInstant.value, startInstant.value) <= 0) {
    return { ok: false, issue: "interval_order" };
  }
  const durationMinutes = startInstant.value
    .until(endInstant.value)
    .total("minutes");
  if (durationMinutes > workMaximumDurationMinutes) {
    return { ok: false, issue: "duration" };
  }
  return {
    ok: true,
    value: {
      startAtUtc: new Date(startInstant.value.epochMilliseconds),
      endAtUtc: new Date(endInstant.value.epochMilliseconds),
      originalTimeZone: input.timeZone,
    },
  };
}

export function validateWorkInterval(input: {
  readonly title: string;
  readonly startLocal: string;
  readonly endLocal: string;
  readonly timeZone: string;
}): WorkValidationResult<WorkIntervalValues> {
  const title = cleanText(input.title, 200);
  if (title === null) return { ok: false, issue: "title" };
  const interval = validateInterval(input);
  return interval.ok
    ? { ok: true, value: { ...interval.value, title } }
    : interval;
}

export function validateWorkBreak(input: {
  readonly startLocal: string;
  readonly endLocal: string;
  readonly timeZone: string;
}): WorkValidationResult<WorkBreakValues> {
  return validateInterval(input);
}

export function workDayWindow(
  localDate: string,
  timeZone: string,
): WorkValidationResult<WorkWindow> {
  const date = parseDate(localDate.trim());
  if (date === null) return { ok: false, issue: "date" };
  try {
    const start = date.toZonedDateTime({ timeZone, plainTime: "00:00" });
    const end = date.add({ days: 1 }).toZonedDateTime({
      timeZone,
      plainTime: "00:00",
    });
    return {
      ok: true,
      value: {
        startAtUtc: new Date(start.epochMilliseconds),
        endAtUtc: new Date(end.epochMilliseconds),
        timeZone,
      },
    };
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, issue: "time_zone" };
    throw error;
  }
}

export function workReportWindow(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly timeZone: string;
}): WorkValidationResult<WorkReportWindow> {
  const startDate = parseDate(input.startDate.trim());
  const endDate = parseDate(input.endDate.trim());
  if (startDate === null || endDate === null) {
    return { ok: false, issue: "date" };
  }
  const dayDifference = startDate.until(endDate, { largestUnit: "day" }).days;
  if (dayDifference < 0) return { ok: false, issue: "range_order" };
  const civilDayCount = dayDifference + 1;
  if (civilDayCount > workReportMaxDays) {
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

function clippedMinutes(start: Date, end: Date, window: WorkWindow): number {
  const clippedStart = Math.max(start.getTime(), window.startAtUtc.getTime());
  const clippedEnd = Math.min(end.getTime(), window.endAtUtc.getTime());
  return Math.max(0, Math.trunc((clippedEnd - clippedStart) / 60_000));
}

export function calculateWorkReport(
  window: WorkReportWindow,
  records: WorkDayRecords,
): WorkReport {
  const lines = records.workLogs.map((log): WorkLogReportLine => {
    const clippedStart = new Date(
      Math.max(log.startAtUtc.getTime(), window.startAtUtc.getTime()),
    );
    const clippedEnd = new Date(
      Math.min(log.endAtUtc.getTime(), window.endAtUtc.getTime()),
    );
    const grossMinutes = clippedMinutes(log.startAtUtc, log.endAtUtc, window);
    const breakMinutes = records.breaks
      .filter((entry) => entry.workLogId === log.id)
      .reduce(
        (total, entry) =>
          total + clippedMinutes(entry.startAtUtc, entry.endAtUtc, window),
        0,
      );
    return {
      workLogId: log.id,
      ruleId: log.ruleId,
      ruleVersion: log.ruleVersion,
      ruleName: log.ruleName,
      breakTreatment: log.breakTreatment,
      clippedStartAtUtc: clippedStart,
      clippedEndAtUtc: clippedEnd,
      grossMinutes,
      breakMinutes,
      countedMinutes:
        log.breakTreatment === "paid"
          ? grossMinutes
          : grossMinutes - breakMinutes,
    };
  });
  return {
    policyVersion: workReportPolicyVersion,
    window,
    plannedShifts: records.plannedShifts,
    workLogs: records.workLogs,
    breaks: records.breaks,
    lines,
    totals: {
      scheduledMinutes: records.plannedShifts.reduce(
        (total, shift) =>
          total + clippedMinutes(shift.startAtUtc, shift.endAtUtc, window),
        0,
      ),
      actualGrossMinutes: lines.reduce(
        (total, line) => total + line.grossMinutes,
        0,
      ),
      breakMinutes: lines.reduce((total, line) => total + line.breakMinutes, 0),
      countedMinutes: lines.reduce(
        (total, line) => total + line.countedMinutes,
        0,
      ),
    },
  };
}
