import { Temporal } from "@js-temporal/polyfill";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import {
  planReminderOccurrence,
  validateReminderRecurrence,
  type ReminderRecurrenceFrequency,
  type ReminderRecurrenceRecord,
} from "../../src/domains/reminders/recurrence";

function validRecurrence(input: {
  scheduledLocal: string;
  frequency?: ReminderRecurrenceFrequency;
  timeZone?: string;
}) {
  const result = validateReminderRecurrence({
    text: "  Idratati  ",
    frequency: input.frequency ?? "daily",
    scheduledLocal: input.scheduledLocal,
    timeZone: input.timeZone ?? "Europe/Rome",
    referenceInstant: new Date("2020-01-01T00:00:00Z"),
  });
  if (!result.ok) throw new Error(`invalid fixture: ${result.issue}`);
  return result.value;
}

function record(
  values: ReturnType<typeof validRecurrence>,
): ReminderRecurrenceRecord {
  return { id: "recurrence-a", ...values, status: "active", version: 1 };
}

describe("B6.2 reminder recurrence domain", () => {
  it("parses only the bounded explicit recurrence commands", () => {
    expect(
      parseDeterministicCommand(
        "/promemoria ricorrente giornaliero 2026-08-20T09:30 | Idratati",
      ),
    ).toEqual({
      kind: "reminders.recurrence.create",
      frequency: "daily",
      scheduledLocal: "2026-08-20T09:30",
      text: " Idratati",
    });
    expect(
      parseDeterministicCommand(
        "/promemoria ricorrente settimanale 2026-08-20T09:30 | Report",
      ),
    ).toMatchObject({
      kind: "reminders.recurrence.create",
      frequency: "weekly",
    });
    expect(parseDeterministicCommand("/promemoria ricorrenza rec-a")).toEqual({
      kind: "reminders.recurrence.read",
      recurrenceId: "rec-a",
    });
    expect(parseDeterministicCommand("/promemoria ricorrenze")).toEqual({
      kind: "reminders.recurrence.list",
    });
    expect(parseDeterministicCommand("/promemoria ferma rec-a 3")).toEqual({
      kind: "reminders.recurrence.cancel",
      recurrenceId: "rec-a",
      expectedVersion: 3,
    });
    for (const invalid of [
      "/promemoria ricorrente mensile 2026-08-20T09:30 | No",
      "/promemoria ferma rec-a 0",
      "/promemoria ferma rec-a x",
    ]) {
      expect(parseDeterministicCommand(invalid)).toEqual({
        kind: "reminders.invalid",
      });
    }
  });

  it("uses later for DST gaps and folds while retaining the civil rule", () => {
    expect(
      validRecurrence({ scheduledLocal: "2026-03-29T02:30" }),
    ).toMatchObject({
      localTime: "02:30",
      nextLocalDate: "2026-03-29",
      nextDueAtUtc: new Date("2026-03-29T01:30:00Z"),
    });
    expect(
      validRecurrence({ scheduledLocal: "2026-10-25T02:30" }),
    ).toMatchObject({
      localTime: "02:30",
      nextLocalDate: "2026-10-25",
      nextDueAtUtc: new Date("2026-10-25T01:30:00Z"),
    });
  });

  it("coalesces missed slots and advances directly to the first future slot", () => {
    const recurrence = record(
      validRecurrence({ scheduledLocal: "2026-01-01T09:00" }),
    );
    const plan = planReminderOccurrence(
      recurrence,
      new Date("2026-08-19T12:00:00Z"),
    );
    expect(plan.scheduledLocal).toBe("2026-01-01T09:00");
    expect(plan.dueAtUtc).toEqual(new Date("2026-01-01T08:00:00Z"));
    expect(plan.nextLocalDate).toBe("2026-08-20");
    expect(plan.nextDueAtUtc.getTime()).toBeGreaterThan(
      Date.parse("2026-08-19T12:00:00Z"),
    );
  });

  it("keeps daily and weekly civil cadence across dates and timezones", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2021-01-01T00:00:00Z"),
          max: new Date("2035-12-20T00:00:00Z"),
          noInvalidDate: true,
        }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.constantFrom("daily" as const, "weekly" as const),
        fc.constantFrom("Europe/Rome", "America/New_York", "Asia/Tokyo"),
        fc.integer({ min: 0, max: 500 }),
        (date, hour, minute, frequency, timeZone, elapsedDays) => {
          const localDate = Temporal.PlainDate.from(
            date.toISOString().slice(0, 10),
          );
          const localTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          const values = validRecurrence({
            scheduledLocal: `${localDate.toString()}T${localTime}`,
            frequency,
            timeZone,
          });
          const after = new Date(
            values.nextDueAtUtc.getTime() + elapsedDays * 86_400_000,
          );
          const plan = planReminderOccurrence(record(values), after);
          const nextDate = Temporal.PlainDate.from(plan.nextLocalDate);
          const distance = localDate.until(nextDate, {
            largestUnit: "days",
          }).days;
          const step = frequency === "daily" ? 1 : 7;
          expect(plan.nextDueAtUtc.getTime()).toBeGreaterThan(after.getTime());
          expect(distance).toBeGreaterThan(0);
          expect(distance % step).toBe(0);
          expect(plan.scheduledLocal).toBe(
            `${localDate.toString()}T${localTime}`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects invalid, past and unbounded inputs", () => {
    expect(
      validateReminderRecurrence({
        text: "x".repeat(201),
        frequency: "daily",
        scheduledLocal: "2026-08-20T09:30",
        timeZone: "Europe/Rome",
        referenceInstant: new Date("2026-08-19T00:00:00Z"),
      }),
    ).toEqual({ ok: false, issue: "text" });
    expect(
      validateReminderRecurrence({
        text: "Past",
        frequency: "daily",
        scheduledLocal: "2026-08-19T09:30",
        timeZone: "Europe/Rome",
        referenceInstant: new Date("2026-08-19T12:00:00Z"),
      }),
    ).toEqual({ ok: false, issue: "not_future" });
    expect(
      validateReminderRecurrence({
        text: "TZ",
        frequency: "daily",
        scheduledLocal: "2026-08-20T09:30",
        timeZone: "Mars/Olympus",
        referenceInstant: new Date("2026-08-19T00:00:00Z"),
      }),
    ).toEqual({ ok: false, issue: "time_zone" });
  });
});
