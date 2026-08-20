import { describe, expect, it } from "vitest";
import {
  parseWorkCommand,
  workCommandRoutes,
} from "../../src/application/commands/work";

describe("C0.1 work command parser", () => {
  it("parses rules, shifts, logs, breaks and views", () => {
    expect(
      parseWorkCommand("/lavoro regola crea non_retribuita | Standard"),
    ).toEqual({
      kind: "work.rule.create",
      breakTreatment: "unpaid",
      name: " Standard",
    });
    expect(
      parseWorkCommand(
        "/lavoro turno crea 2026-08-20T09:00 2026-08-20T17:00 | Negozio",
      ),
    ).toEqual({
      kind: "work.shift.create",
      startLocal: "2026-08-20T09:00",
      endLocal: "2026-08-20T17:00",
      title: " Negozio",
    });
    expect(
      parseWorkCommand(
        "/lavoro pausa crea log-1 2026-08-20T12:00 2026-08-20T12:30",
      ),
    ).toEqual({
      kind: "work.break.create",
      workLogId: "log-1",
      startLocal: "2026-08-20T12:00",
      endLocal: "2026-08-20T12:30",
    });
    expect(parseWorkCommand("/lavoro giorno 2026-08-20")).toEqual({
      kind: "work.day",
      localDate: "2026-08-20",
    });
    expect(parseWorkCommand("/lavoro sconosciuto")).toEqual({
      kind: "work.invalid",
    });
  });

  it("registra soltanto /lavoro", () => {
    expect(workCommandRoutes.map(([keyword]) => keyword)).toEqual(["/lavoro"]);
  });
});
