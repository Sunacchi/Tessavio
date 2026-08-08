import { Temporal } from "@js-temporal/polyfill";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import {
  eventDayWindow,
  validateDateOnlyEvent,
  validateInstantEvent,
} from "../../src/domains/events/events";

describe("B1.2 event contract", () => {
  it("keeps date-only values separate from instants", () => {
    expect(
      validateDateOnlyEvent({
        title: "  Compleanno  ",
        localDate: "2026-08-10",
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: "date_only",
        title: "Compleanno",
        localDate: "2026-08-10",
      },
    });
    expect(
      validateDateOnlyEvent({ title: "Compleanno", localDate: "2026-02-30" }),
    ).toEqual({ ok: false, issue: "date" });
  });

  it("converts civil times to UTC while preserving the original IANA timezone", () => {
    expect(
      validateInstantEvent({
        title: "Dentista",
        startLocal: "2026-08-10T17:00",
        endLocal: "2026-08-10T18:00",
        timeZone: "Europe/Rome",
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: "instant",
        title: "Dentista",
        startAtUtc: new Date("2026-08-10T15:00:00.000Z"),
        endAtUtc: new Date("2026-08-10T16:00:00.000Z"),
        originalTimeZone: "Europe/Rome",
      },
    });
  });

  it.each(["2026-03-29T02:30", "2026-10-25T02:30"])(
    "rejects a DST gap or fold instead of choosing implicitly: %s",
    (localTime) => {
      expect(
        validateInstantEvent({
          title: "Ora ambigua",
          startLocal: localTime,
          endLocal: localTime.replace(":30", ":45"),
          timeZone: "Europe/Rome",
        }),
      ).toEqual({ ok: false, issue: "ambiguous_local_time" });
    },
  );

  it("uses the Telegram message instant and yields 23/25-hour Rome days", () => {
    const spring = eventDayWindow(
      Date.parse("2026-03-29T12:00:00Z") / 1_000,
      "Europe/Rome",
      0,
    );
    const autumn = eventDayWindow(
      Date.parse("2026-10-25T12:00:00Z") / 1_000,
      "Europe/Rome",
      0,
    );
    expect(spring.localDate).toBe("2026-03-29");
    expect(spring.endAtUtc.getTime() - spring.startAtUtc.getTime()).toBe(
      23 * 60 * 60 * 1_000,
    );
    expect(autumn.endAtUtc.getTime() - autumn.startAtUtc.getTime()).toBe(
      25 * 60 * 60 * 1_000,
    );
  });

  it("moves /oggi across UTC midnight according to the user's timezone", () => {
    const rome = eventDayWindow(
      Date.parse("2026-08-08T22:30:00Z") / 1_000,
      "Europe/Rome",
      0,
    );
    const newYork = eventDayWindow(
      Date.parse("2026-08-09T02:30:00Z") / 1_000,
      "America/New_York",
      0,
    );
    expect(rome.localDate).toBe("2026-08-09");
    expect(newYork.localDate).toBe("2026-08-08");
  });

  it("keeps adjacent local-day windows contiguous across zones and DST", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_577_836_800, max: 1_924_991_999 }),
        fc.constantFrom(
          "Europe/Rome",
          "America/New_York",
          "Pacific/Auckland",
          "Australia/Lord_Howe",
          "Asia/Tokyo",
        ),
        (sentAtUnix, timeZone) => {
          const today = eventDayWindow(sentAtUnix, timeZone, 0);
          const tomorrow = eventDayWindow(sentAtUnix, timeZone, 1);
          expect(today.endAtUtc.getTime()).toBe(tomorrow.startAtUtc.getTime());
          expect(
            Temporal.PlainDate.from(today.localDate)
              .add({ days: 1 })
              .toString(),
          ).toBe(tomorrow.localDate);
          expect(today.startAtUtc.getTime()).toBeLessThan(
            today.endAtUtc.getTime(),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("parses only explicit complete event commands", () => {
    expect(
      parseDeterministicCommand(
        "/evento crea ora 2026-08-10T17:00 2026-08-10T18:00 | Visita dentistica",
      ),
    ).toEqual({
      kind: "events.create",
      representation: "instant",
      startLocal: "2026-08-10T17:00",
      endLocal: "2026-08-10T18:00",
      title: " Visita dentistica",
    });
    expect(
      parseDeterministicCommand(
        "/evento modifica event-1 data 2026-08-11 | Giorno libero",
      ),
    ).toEqual({
      kind: "events.update",
      eventId: "event-1",
      representation: "date_only",
      localDate: "2026-08-11",
      title: " Giorno libero",
    });
    expect(parseDeterministicCommand("/evento crea data 2026-08-10")).toEqual({
      kind: "events.invalid",
    });
    expect(parseDeterministicCommand("/oggi")).toEqual({
      kind: "events.today",
    });
  });
});
