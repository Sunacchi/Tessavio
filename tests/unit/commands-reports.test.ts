import { describe, expect, it } from "vitest";
import {
  parseReportCommand,
  reportCommandRoutes,
} from "../../src/application/commands/reports";

describe("C0.1 report command parser", () => {
  it("distingue riepilogo e CSV", () => {
    expect(parseReportCommand("/report 2026-08-01 2026-08-31")).toEqual({
      kind: "reports.summary",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(parseReportCommand("/report csv 2026-08-01 2026-08-31")).toEqual({
      kind: "reports.csv",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(parseReportCommand("/report")).toEqual({ kind: "reports.invalid" });
  });

  it("registra soltanto /report", () => {
    expect(reportCommandRoutes.map(([keyword]) => keyword)).toEqual([
      "/report",
    ]);
  });
});
