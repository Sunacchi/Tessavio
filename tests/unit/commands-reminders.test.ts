import { describe, expect, it } from "vitest";
import {
  parseReminderCommand,
  reminderCommandRoutes,
} from "../../src/application/commands/reminders";

describe("C0.1 reminder command parser", () => {
  it("parses one-off, recurrence and read shapes", () => {
    expect(
      parseReminderCommand("/promemoria crea 2026-08-20T09:00 | Pillola"),
    ).toEqual({
      kind: "reminders.create",
      scheduledLocal: "2026-08-20T09:00",
      text: " Pillola",
    });
    expect(
      parseReminderCommand(
        "/promemoria ricorrente giornaliero 09:00 | Pillola",
      ),
    ).toEqual({
      kind: "reminders.recurrence.create",
      frequency: "daily",
      scheduledLocal: "09:00",
      text: " Pillola",
    });
    expect(parseReminderCommand("/promemoria ferma rec-1 2")).toEqual({
      kind: "reminders.recurrence.cancel",
      recurrenceId: "rec-1",
      expectedVersion: 2,
    });
    expect(parseReminderCommand("/promemoria ferma rec-1 0")).toEqual({
      kind: "reminders.invalid",
    });
  });

  it("registra soltanto /promemoria", () => {
    expect(reminderCommandRoutes.map(([keyword]) => keyword)).toEqual([
      "/promemoria",
    ]);
  });
});
