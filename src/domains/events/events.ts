import { Temporal } from "@js-temporal/polyfill";

export const eventUndoTtlMs = 15 * 60 * 1_000;
export const eventTitleMaxLength = 200;

export type EventStatus = "active" | "cancelled";

interface EventRecordBase {
  readonly id: string;
  readonly title: string;
  readonly status: EventStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly cancelledAt: Date | null;
}

export interface DateOnlyEventRecord extends EventRecordBase {
  readonly kind: "date_only";
  readonly localDate: string;
}

export interface InstantEventRecord extends EventRecordBase {
  readonly kind: "instant";
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
  readonly originalTimeZone: string;
}

export type EventRecord = DateOnlyEventRecord | InstantEventRecord;

export interface DateOnlyEventValues {
  readonly kind: "date_only";
  readonly title: string;
  readonly localDate: string;
}

export interface InstantEventValues {
  readonly kind: "instant";
  readonly title: string;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
  readonly originalTimeZone: string;
}

export type EventValues = DateOnlyEventValues | InstantEventValues;

export type EventValidationIssue =
  | "title"
  | "date"
  | "date_time"
  | "ambiguous_local_time"
  | "interval"
  | "time_zone";

export type EventValidationResult =
  | { readonly ok: true; readonly value: EventValues }
  | { readonly ok: false; readonly issue: EventValidationIssue };

export interface EventDayWindow {
  readonly localDate: string;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
}

export interface EventRangeWindow {
  readonly startDate: string;
  readonly endDate: string;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
}

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

function validateTitle(value: string): string | null {
  const title = value.trim();
  const hasControlCharacter = Array.from(title).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  if (
    title.length < 1 ||
    title.length > eventTitleMaxLength ||
    hasControlCharacter
  ) {
    return null;
  }
  return title;
}

function parseLocalDate(value: string): Temporal.PlainDate | null {
  if (!localDatePattern.test(value)) {
    return null;
  }
  try {
    const parsed = Temporal.PlainDate.from(value, { overflow: "reject" });
    return parsed.toString() === value ? parsed : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function parseLocalDateTime(value: string): Temporal.PlainDateTime | null {
  if (!localDateTimePattern.test(value)) {
    return null;
  }
  try {
    return Temporal.PlainDateTime.from(value, { overflow: "reject" });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function resolveLocalInstant(
  value: Temporal.PlainDateTime,
  timeZone: string,
):
  | { readonly ok: true; readonly value: Temporal.Instant }
  | {
      readonly ok: false;
      readonly issue: "ambiguous_local_time" | "time_zone";
    } {
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

export function validateDateOnlyEvent(input: {
  readonly title: string;
  readonly localDate: string;
}): EventValidationResult {
  const title = validateTitle(input.title);
  if (title === null) return { ok: false, issue: "title" };
  const localDate = parseLocalDate(input.localDate);
  if (localDate === null) return { ok: false, issue: "date" };
  return {
    ok: true,
    value: { kind: "date_only", title, localDate: localDate.toString() },
  };
}

export function validateInstantEvent(input: {
  readonly title: string;
  readonly startLocal: string;
  readonly endLocal: string;
  readonly timeZone: string;
}): EventValidationResult {
  const title = validateTitle(input.title);
  if (title === null) return { ok: false, issue: "title" };
  const startLocal = parseLocalDateTime(input.startLocal);
  const endLocal = parseLocalDateTime(input.endLocal);
  if (startLocal === null || endLocal === null) {
    return { ok: false, issue: "date_time" };
  }

  const start = resolveLocalInstant(startLocal, input.timeZone);
  if (!start.ok) return start;
  const end = resolveLocalInstant(endLocal, input.timeZone);
  if (!end.ok) return end;
  if (Temporal.Instant.compare(start.value, end.value) >= 0) {
    return { ok: false, issue: "interval" };
  }

  return {
    ok: true,
    value: {
      kind: "instant",
      title,
      startAtUtc: new Date(start.value.epochMilliseconds),
      endAtUtc: new Date(end.value.epochMilliseconds),
      originalTimeZone: input.timeZone,
    },
  };
}

export function eventDayWindow(
  sentAtUnix: number,
  timeZone: string,
  dayOffset: 0 | 1,
): EventDayWindow {
  if (!Number.isSafeInteger(sentAtUnix)) {
    throw new RangeError("invalid message timestamp");
  }
  const messageInstant = Temporal.Instant.fromEpochMilliseconds(
    sentAtUnix * 1_000,
  );
  const localDate = messageInstant
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .add({ days: dayOffset });
  const start = localDate.toZonedDateTime(timeZone).toInstant();
  const end = localDate.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
  return {
    localDate: localDate.toString(),
    startAtUtc: new Date(start.epochMilliseconds),
    endAtUtc: new Date(end.epochMilliseconds),
  };
}
