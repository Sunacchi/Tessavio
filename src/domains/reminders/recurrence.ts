import { Temporal } from "@js-temporal/polyfill";

export type ReminderRecurrenceFrequency = "daily" | "weekly";
export type ReminderRecurrenceStatus = "active" | "cancelled";

export interface ReminderRecurrenceRecord {
  readonly id: string;
  readonly text: string;
  readonly frequency: ReminderRecurrenceFrequency;
  readonly localTime: string;
  readonly timeZone: string;
  readonly nextLocalDate: string;
  readonly nextDueAtUtc: Date;
  readonly status: ReminderRecurrenceStatus;
  readonly version: number;
}

export interface ReminderRecurrenceValues {
  readonly text: string;
  readonly frequency: ReminderRecurrenceFrequency;
  readonly localTime: string;
  readonly timeZone: string;
  readonly nextLocalDate: string;
  readonly nextDueAtUtc: Date;
}

export type ReminderRecurrenceValidationResult =
  | { readonly ok: true; readonly value: ReminderRecurrenceValues }
  | {
      readonly ok: false;
      readonly issue: "text" | "date_time" | "not_future" | "time_zone";
    };

export interface ReminderOccurrencePlan {
  readonly scheduledLocal: string;
  readonly dueAtUtc: Date;
  readonly nextLocalDate: string;
  readonly nextDueAtUtc: Date;
}

export const reminderRecurrenceUndoTtlMs = 15 * 60 * 1_000;

function validText(value: string): string | null {
  const text = value.trim();
  const hasControlCharacter = Array.from(text).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  return text.length >= 1 && text.length <= 200 && !hasControlCharacter
    ? text
    : null;
}

function parseTime(value: string): Temporal.PlainTime {
  if (!/^\d{2}:\d{2}$/u.test(value)) throw new RangeError("invalid time");
  return Temporal.PlainTime.from(value, { overflow: "reject" });
}

function resolveOccurrence(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
): Temporal.Instant {
  return Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time.hour,
      minute: time.minute,
    },
    { disambiguation: "later", overflow: "reject" },
  ).toInstant();
}

function minuteTime(value: Temporal.PlainTime): string {
  return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
}

export function validateReminderRecurrence(input: {
  readonly text: string;
  readonly frequency: ReminderRecurrenceFrequency;
  readonly scheduledLocal: string;
  readonly timeZone: string;
  readonly referenceInstant: Date;
}): ReminderRecurrenceValidationResult {
  const text = validText(input.text);
  if (text === null) return { ok: false, issue: "text" };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(input.scheduledLocal)) {
    return { ok: false, issue: "date_time" };
  }
  let local: Temporal.PlainDateTime;
  let due: Temporal.Instant;
  try {
    local = Temporal.PlainDateTime.from(input.scheduledLocal, {
      overflow: "reject",
    });
    due = resolveOccurrence(
      local.toPlainDate(),
      local.toPlainTime(),
      input.timeZone,
    );
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format(0);
    } catch (timeZoneError) {
      if (timeZoneError instanceof RangeError) {
        return { ok: false, issue: "time_zone" };
      }
      throw timeZoneError;
    }
    return { ok: false, issue: "date_time" };
  }
  if (due.epochMilliseconds <= input.referenceInstant.getTime()) {
    return { ok: false, issue: "not_future" };
  }
  return {
    ok: true,
    value: {
      text,
      frequency: input.frequency,
      localTime: minuteTime(local.toPlainTime()),
      timeZone: input.timeZone,
      nextLocalDate: local.toPlainDate().toString(),
      nextDueAtUtc: new Date(due.epochMilliseconds),
    },
  };
}

export function planReminderOccurrence(
  recurrence: ReminderRecurrenceRecord,
  afterInstant: Date,
): ReminderOccurrencePlan {
  const currentDate = Temporal.PlainDate.from(recurrence.nextLocalDate, {
    overflow: "reject",
  });
  const time = parseTime(recurrence.localTime);
  const currentDue = resolveOccurrence(currentDate, time, recurrence.timeZone);
  const stepDays = recurrence.frequency === "daily" ? 1 : 7;
  let nextDate = currentDate.add({ days: stepDays });
  const afterDate = Temporal.Instant.fromEpochMilliseconds(
    afterInstant.getTime(),
  )
    .toZonedDateTimeISO(recurrence.timeZone)
    .toPlainDate();
  const distance = nextDate.until(afterDate, { largestUnit: "days" }).days;
  if (distance > 0) {
    nextDate = nextDate.add({
      days: Math.floor(distance / stepDays) * stepDays,
    });
  }
  let nextDue = resolveOccurrence(nextDate, time, recurrence.timeZone);
  while (nextDue.epochMilliseconds <= afterInstant.getTime()) {
    nextDate = nextDate.add({ days: stepDays });
    nextDue = resolveOccurrence(nextDate, time, recurrence.timeZone);
  }
  return {
    scheduledLocal: `${currentDate.toString()}T${minuteTime(time)}`,
    dueAtUtc: new Date(currentDue.epochMilliseconds),
    nextLocalDate: nextDate.toString(),
    nextDueAtUtc: new Date(nextDue.epochMilliseconds),
  };
}
