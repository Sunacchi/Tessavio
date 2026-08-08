import { describe, expect, it } from "vitest";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import {
  isWithinQuietHours,
  nextQuietHoursEnd,
  validateReminder,
} from "../../src/domains/reminders/reminders";
import { validateQuietHours } from "../../src/domains/preferences/preferences";

describe("B2 reminder domain", () => {
  it("resolves an explicit local reminder to one UTC instant", () => {
    expect(
      validateReminder({
        text: "  Chiama il dentista  ",
        scheduledLocal: "2026-08-08T17:00",
        timeZone: "Europe/Rome",
        referenceInstant: new Date("2026-08-08T08:00:00Z"),
      }),
    ).toEqual({
      ok: true,
      value: {
        text: "Chiama il dentista",
        requestedAtUtc: new Date("2026-08-08T15:00:00Z"),
        originalTimeZone: "Europe/Rome",
      },
    });
  });

  it("rejects DST gaps, folds and instants not in the future", () => {
    for (const scheduledLocal of ["2026-03-29T02:30", "2026-10-25T02:30"]) {
      expect(
        validateReminder({
          text: "DST",
          scheduledLocal,
          timeZone: "Europe/Rome",
          referenceInstant: new Date("2026-01-01T00:00:00Z"),
        }),
      ).toEqual({ ok: false, issue: "ambiguous_local_time" });
    }
    expect(
      validateReminder({
        text: "Passato",
        scheduledLocal: "2026-08-08T09:00",
        timeZone: "Europe/Rome",
        referenceInstant: new Date("2026-08-08T08:00:00Z"),
      }),
    ).toEqual({ ok: false, issue: "not_future" });
  });

  it("applies cross-midnight quiet hours with DST-safe release", () => {
    const quiet = { startMinute: 22 * 60, endMinute: 7 * 60 };
    expect(
      isWithinQuietHours(
        new Date("2026-08-08T21:30:00Z"),
        "Europe/Rome",
        quiet,
      ),
    ).toBe(true);
    expect(
      nextQuietHoursEnd(new Date("2026-08-08T21:30:00Z"), "Europe/Rome", quiet),
    ).toEqual(new Date("2026-08-09T05:00:00Z"));
    expect(validateQuietHours("22:00", "07:00")).toEqual({
      ok: true,
      value: quiet,
    });
    expect(validateQuietHours("22:00", "22:00")).toEqual({ ok: false });
  });

  it("parses only explicit reminder and quiet-hours commands", () => {
    expect(
      parseDeterministicCommand(
        "/promemoria crea 2026-08-08T17:00 | Chiama il dentista",
      ),
    ).toEqual({
      kind: "reminders.create",
      scheduledLocal: "2026-08-08T17:00",
      text: " Chiama il dentista",
    });
    expect(parseDeterministicCommand("/promemoria lista")).toEqual({
      kind: "reminders.list",
    });
    expect(
      parseDeterministicCommand("/impostazioni quiete 22:00 07:00"),
    ).toEqual({
      kind: "preferences.quiet_hours.set",
      start: "22:00",
      end: "07:00",
    });
  });
});
