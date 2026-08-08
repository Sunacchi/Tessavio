import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import {
  calculateWorkReport,
  validateWorkBreak,
  validateWorkInterval,
  workReportWindow,
} from "../../src/domains/work/work";

describe("B4 work domain", () => {
  it("parses the explicit Italian work command contract", () => {
    expect(
      parseDeterministicCommand(
        "/lavoro regola crea non_retribuita | Standard",
      ),
    ).toEqual({
      kind: "work.rule.create",
      breakTreatment: "unpaid",
      name: " Standard",
    });
    expect(
      parseDeterministicCommand(
        "/lavoro turno crea 2026-08-08T22:00 2026-08-09T06:00 | Notte",
      ),
    ).toEqual({
      kind: "work.shift.create",
      startLocal: "2026-08-08T22:00",
      endLocal: "2026-08-09T06:00",
      title: " Notte",
    });
    expect(
      parseDeterministicCommand(
        "/lavoro consuntivo crea 2026-08-08T22:00 2026-08-09T06:00 rule-1 | Notte",
      ),
    ).toMatchObject({ kind: "work.log.create", ruleId: "rule-1" });
    expect(
      parseDeterministicCommand(
        "/lavoro pausa crea log-1 2026-08-09T01:00 2026-08-09T01:30",
      ),
    ).toEqual({
      kind: "work.break.create",
      workLogId: "log-1",
      startLocal: "2026-08-09T01:00",
      endLocal: "2026-08-09T01:30",
    });
    expect(
      parseDeterministicCommand("/lavoro report 2026-08-01 2026-08-31"),
    ).toEqual({
      kind: "work.report",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
  });

  it("resolves midnight and DST by UTC instants and rejects gaps/folds", () => {
    expect(
      validateWorkInterval({
        title: "Notte",
        startLocal: "2026-03-28T22:00",
        endLocal: "2026-03-29T06:00",
        timeZone: "Europe/Rome",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        startAtUtc: new Date("2026-03-28T21:00:00Z"),
        endAtUtc: new Date("2026-03-29T04:00:00Z"),
      },
    });
    for (const local of ["2026-03-29T02:30", "2026-10-25T02:30"]) {
      expect(
        validateWorkBreak({
          startLocal: local,
          endLocal: "2026-10-25T04:00",
          timeZone: "Europe/Rome",
        }),
      ).toEqual({ ok: false, issue: "ambiguous_local_time" });
    }
  });

  it("enforces interval and inclusive report bounds", () => {
    expect(
      validateWorkInterval({
        title: "Troppo lungo",
        startLocal: "2026-01-01T00:00",
        endLocal: "2026-01-03T00:01",
        timeZone: "UTC",
      }),
    ).toEqual({ ok: false, issue: "duration" });
    expect(
      workReportWindow({
        startDate: "2024-01-01",
        endDate: "2025-01-01",
        timeZone: "Europe/Rome",
      }),
    ).toEqual({ ok: false, issue: "range_duration" });

    const spring = workReportWindow({
      startDate: "2026-03-29",
      endDate: "2026-03-29",
      timeZone: "Europe/Rome",
    });
    const autumn = workReportWindow({
      startDate: "2026-10-25",
      endDate: "2026-10-25",
      timeZone: "Europe/Rome",
    });
    expect(
      spring.ok &&
        spring.value.endAtUtc.getTime() - spring.value.startAtUtc.getTime(),
    ).toBe(23 * 60 * 60 * 1_000);
    expect(
      autumn.ok &&
        autumn.value.endAtUtc.getTime() - autumn.value.startAtUtc.getTime(),
    ).toBe(25 * 60 * 60 * 1_000);
  });

  it("clamps intervals and applies the work-log rule snapshot", () => {
    const window = workReportWindow({
      startDate: "2026-08-08",
      endDate: "2026-08-08",
      timeZone: "UTC",
    });
    if (!window.ok) throw new Error("window");
    const base = {
      version: 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      originalTimeZone: "UTC",
    };
    const report = calculateWorkReport(window.value, {
      truncated: false,
      plannedShiftsTruncated: false,
      plannedShifts: [
        {
          ...base,
          id: "shift",
          title: "Turno",
          startAtUtc: new Date("2026-08-07T23:00:00Z"),
          endAtUtc: new Date("2026-08-08T02:00:00Z"),
        },
      ],
      workLogs: [
        {
          ...base,
          id: "log",
          title: "Consuntivo",
          startAtUtc: new Date("2026-08-08T08:00:00Z"),
          endAtUtc: new Date("2026-08-08T12:00:00Z"),
          ruleId: "rule",
          ruleVersion: 3,
          ruleName: "Non pagata",
          breakTreatment: "unpaid",
        },
      ],
      breaks: [
        {
          ...base,
          id: "break",
          workLogId: "log",
          startAtUtc: new Date("2026-08-08T10:00:00Z"),
          endAtUtc: new Date("2026-08-08T10:30:00Z"),
        },
      ],
    });
    expect(report.totals).toEqual({
      scheduledMinutes: 120,
      actualGrossMinutes: 240,
      breakMinutes: 30,
      countedMinutes: 210,
    });
    expect(report.policyVersion).toBe("work-report-v1");
  });

  it("preserves minute accounting for paid and unpaid break policies", () => {
    const window = workReportWindow({
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      timeZone: "UTC",
    });
    if (!window.ok) throw new Error("window");
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 2_880 }),
        fc.nat(),
        fc.nat(),
        (gross, startSeed, durationSeed) => {
          const breakStart = 1 + (startSeed % (gross - 2));
          const maximumBreak = gross - breakStart - 1;
          const breakDuration = 1 + (durationSeed % maximumBreak);
          const start = new Date("2026-01-01T00:00:00Z");
          const base = {
            version: 1,
            createdAt: start,
            updatedAt: start,
            originalTimeZone: "UTC",
          };
          const unpaidLog = {
            ...base,
            id: "log",
            title: "Property",
            startAtUtc: start,
            endAtUtc: new Date(start.getTime() + gross * 60_000),
            ruleId: "rule",
            ruleVersion: 1,
            ruleName: "Property",
            breakTreatment: "unpaid" as const,
          };
          const records = {
            truncated: false,
            plannedShiftsTruncated: false,
            plannedShifts: [],
            workLogs: [unpaidLog],
            breaks: [
              {
                ...base,
                id: "break",
                workLogId: "log",
                startAtUtc: new Date(start.getTime() + breakStart * 60_000),
                endAtUtc: new Date(
                  start.getTime() + (breakStart + breakDuration) * 60_000,
                ),
              },
            ],
          };
          const unpaid = calculateWorkReport(window.value, records);
          const paid = calculateWorkReport(window.value, {
            ...records,
            workLogs: [{ ...unpaidLog, breakTreatment: "paid" as const }],
          });
          expect(unpaid.totals.countedMinutes).toBe(gross - breakDuration);
          expect(paid.totals.countedMinutes).toBe(gross);
          expect(unpaid.totals.breakMinutes).toBe(breakDuration);
        },
      ),
    );
  });

  it("keeps IANA civil days and clamped intervals bounded under generated cases", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2020-01-01T00:00:00Z"),
          max: new Date("2030-12-31T00:00:00Z"),
          noInvalidDate: true,
        }),
        (date) => {
          const localDate = date.toISOString().slice(0, 10);
          const window = workReportWindow({
            startDate: localDate,
            endDate: localDate,
            timeZone: "Europe/Rome",
          });
          expect(window.ok).toBe(true);
          if (!window.ok) return;
          const minutes =
            (window.value.endAtUtc.getTime() -
              window.value.startAtUtc.getTime()) /
            60_000;
          expect([1_380, 1_440, 1_500]).toContain(minutes);
        },
      ),
    );

    const window = workReportWindow({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      timeZone: "UTC",
    });
    if (!window.ok) throw new Error("window");
    fc.assert(
      fc.property(
        fc.integer({ min: -1_440, max: 1_440 }),
        fc.integer({ min: 1, max: 2_880 }),
        (startOffset, duration) => {
          const origin = window.value.startAtUtc.getTime();
          const startAtUtc = new Date(origin + startOffset * 60_000);
          const endAtUtc = new Date(startAtUtc.getTime() + duration * 60_000);
          const base = {
            version: 1,
            createdAt: new Date(0),
            updatedAt: new Date(0),
            originalTimeZone: "UTC",
          };
          const report = calculateWorkReport(window.value, {
            truncated: false,
            plannedShiftsTruncated: false,
            plannedShifts: [
              {
                ...base,
                id: "shift",
                title: "Clamp",
                startAtUtc,
                endAtUtc,
              },
            ],
            workLogs: [],
            breaks: [],
          });
          const expected = Math.max(
            0,
            Math.min(startOffset + duration, 1_440) - Math.max(startOffset, 0),
          );
          expect(report.totals.scheduledMinutes).toBe(expected);
        },
      ),
    );
  });
});
