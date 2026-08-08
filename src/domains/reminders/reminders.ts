import { Temporal } from "@js-temporal/polyfill";
import type { QuietHours } from "../preferences/preferences";

export type ReminderStatus =
  | "pending"
  | "claimed"
  | "sending"
  | "sent"
  | "cancelled"
  | "permanent_failure"
  | "ambiguous";

export interface ReminderRecord {
  readonly id: string;
  readonly text: string;
  readonly requestedAtUtc: Date;
  readonly dueAtUtc: Date;
  readonly originalTimeZone: string;
  readonly status: ReminderStatus;
  readonly version: number;
  readonly deliveryAttempts: number;
}

export type ReminderValidationResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly text: string;
        readonly requestedAtUtc: Date;
        readonly originalTimeZone: string;
      };
    }
  | {
      readonly ok: false;
      readonly issue:
        | "text"
        | "date_time"
        | "ambiguous_local_time"
        | "not_future"
        | "time_zone";
    };

export const reminderUndoTtlMs = 15 * 60 * 1_000;

export function validateReminder(input: {
  readonly text: string;
  readonly scheduledLocal: string;
  readonly timeZone: string;
  readonly referenceInstant: Date;
}): ReminderValidationResult {
  const text = input.text.trim();
  const hasControlCharacter = Array.from(text).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  if (text.length < 1 || text.length > 200 || hasControlCharacter) {
    return { ok: false, issue: "text" };
  }
  let plain: Temporal.PlainDateTime;
  let instant: Temporal.Instant;
  try {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(input.scheduledLocal)) {
      return { ok: false, issue: "date_time" };
    }
    plain = Temporal.PlainDateTime.from(input.scheduledLocal);
    instant = plain
      .toZonedDateTime(input.timeZone, { disambiguation: "reject" })
      .toInstant();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format(0);
      return { ok: false, issue: "ambiguous_local_time" };
    } catch (timeZoneError) {
      if (timeZoneError instanceof RangeError) {
        return { ok: false, issue: "time_zone" };
      }
      throw timeZoneError;
    }
  }
  const requestedAtUtc = new Date(instant.epochMilliseconds);
  if (requestedAtUtc.getTime() <= input.referenceInstant.getTime()) {
    return { ok: false, issue: "not_future" };
  }
  return {
    ok: true,
    value: {
      text,
      requestedAtUtc,
      originalTimeZone: input.timeZone,
    },
  };
}

export function isWithinQuietHours(
  instant: Date,
  timeZone: string,
  quietHours: QuietHours,
): boolean {
  const local = Temporal.Instant.fromEpochMilliseconds(
    instant.getTime(),
  ).toZonedDateTimeISO(timeZone);
  const minute = local.hour * 60 + local.minute;
  return quietHours.startMinute < quietHours.endMinute
    ? minute >= quietHours.startMinute && minute < quietHours.endMinute
    : minute >= quietHours.startMinute || minute < quietHours.endMinute;
}

export function nextQuietHoursEnd(
  instant: Date,
  timeZone: string,
  quietHours: QuietHours,
): Date {
  const local = Temporal.Instant.fromEpochMilliseconds(
    instant.getTime(),
  ).toZonedDateTimeISO(timeZone);
  const minute = local.hour * 60 + local.minute;
  const endHour = Math.floor(quietHours.endMinute / 60);
  const endMinute = quietHours.endMinute % 60;
  const endIsTomorrow =
    quietHours.startMinute < quietHours.endMinute
      ? false
      : minute >= quietHours.startMinute;
  const endDate = endIsTomorrow ? local.toPlainDate().add({ days: 1 }) : local;
  const end = Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: endDate.year,
      month: endDate.month,
      day: endDate.day,
      hour: endHour,
      minute: endMinute,
    },
    { disambiguation: "later" },
  );
  return new Date(end.epochMilliseconds);
}
