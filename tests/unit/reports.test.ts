import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import { baseReportWindow, renderCsv } from "../../src/domains/reports/reports";

describe("B7 base reports", () => {
  it("parses summary and CSV commands without AI", () => {
    expect(parseDeterministicCommand("/report 2026-08-01 2026-08-31")).toEqual({
      kind: "reports.summary",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(
      parseDeterministicCommand("/report CSV 2026-08-01 2026-08-31"),
    ).toEqual({
      kind: "reports.csv",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(parseDeterministicCommand("/report csv 2026-08-01")).toEqual({
      kind: "reports.invalid",
    });
  });

  it("builds civil windows across DST instead of assuming 24 hours", () => {
    const spring = baseReportWindow({
      startDate: "2026-03-29",
      endDate: "2026-03-29",
      timeZone: "Europe/Rome",
    });
    expect(spring.ok).toBe(true);
    if (!spring.ok) return;
    expect(
      spring.value.endAtUtc.getTime() - spring.value.startAtUtc.getTime(),
    ).toBe(23 * 60 * 60 * 1_000);
    expect(spring.value.startAtUtc.toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
    expect(spring.value.endAtUtc.toISOString()).toBe(
      "2026-03-29T22:00:00.000Z",
    );
  });

  it("preserves arbitrary bounded civil-day counts across representative IANA zones", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000 }),
        fc.integer({ min: 1, max: 366 }),
        fc.constantFrom("UTC", "Europe/Rome", "America/New_York"),
        (offset, civilDayCount, timeZone) => {
          const base = new Date(Date.UTC(2024, 0, 1 + offset));
          const end = new Date(
            base.getTime() + (civilDayCount - 1) * 24 * 60 * 60 * 1_000,
          );
          const window = baseReportWindow({
            startDate: base.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
            timeZone,
          });
          expect(window.ok).toBe(true);
          if (!window.ok) return;
          expect(window.value.civilDayCount).toBe(civilDayCount);
          const durationHours =
            (window.value.endAtUtc.getTime() -
              window.value.startAtUtc.getTime()) /
            (60 * 60 * 1_000);
          expect(durationHours).toBeGreaterThanOrEqual(23 * civilDayCount);
          expect(durationHours).toBeLessThanOrEqual(25 * civilDayCount);
        },
      ),
    );
  });

  it("rejects invalid, reversed and overlong civil ranges", () => {
    expect(
      baseReportWindow({
        startDate: "2026-02-30",
        endDate: "2026-03-01",
        timeZone: "UTC",
      }),
    ).toEqual({ ok: false, issue: "date" });
    expect(
      baseReportWindow({
        startDate: "2026-03-02",
        endDate: "2026-03-01",
        timeZone: "UTC",
      }),
    ).toEqual({ ok: false, issue: "range_order" });
    expect(
      baseReportWindow({
        startDate: "2026-01-01",
        endDate: "2027-01-02",
        timeZone: "UTC",
      }),
    ).toEqual({ ok: false, issue: "range_duration" });
  });

  it("renders RFC 4180 rows and neutralizes spreadsheet formulas", () => {
    expect(
      renderCsv([
        ["name", "note"],
        ["=2+2", 'a "quote", and newline\n'],
        ["-1", "-formula"],
      ]),
    ).toBe(
      '"name","note"\r\n"\'=2+2","a ""quote"", and newline\n"\r\n"-1","\'-formula"',
    );
  });
});
