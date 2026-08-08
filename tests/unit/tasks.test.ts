import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import { validateTask } from "../../src/domains/tasks/tasks";

describe("B3 task contract", () => {
  it("parses explicit create/read/list/complete/reopen commands", () => {
    expect(
      parseDeterministicCommand(
        "/task crea 2026-08-10 | alta | Prenotare il dentista",
      ),
    ).toEqual({
      kind: "tasks.create",
      due: "2026-08-10",
      priority: " alta ",
      title: " Prenotare il dentista",
    });
    expect(parseDeterministicCommand("/task lista")).toEqual({
      kind: "tasks.list",
    });
    expect(parseDeterministicCommand("/task leggi task-1")).toEqual({
      kind: "tasks.read",
      taskId: "task-1",
    });
    expect(parseDeterministicCommand("/task completa task-1")).toEqual({
      kind: "tasks.complete",
      taskId: "task-1",
    });
    expect(parseDeterministicCommand("/task riapri task-1")).toEqual({
      kind: "tasks.reopen",
      taskId: "task-1",
    });
  });

  it("keeps no due date, date-only and instant deadlines distinct", () => {
    expect(
      validateTask({
        title: " Senza scadenza ",
        priority: "bassa",
        due: "nessuna",
        timeZone: "Europe/Rome",
      }),
    ).toEqual({
      ok: true,
      value: {
        dueKind: "none",
        title: "Senza scadenza",
        priority: "low",
      },
    });
    expect(
      validateTask({
        title: "Giorno intero",
        priority: "media",
        due: "2026-08-10",
        timeZone: "Europe/Rome",
      }),
    ).toEqual({
      ok: true,
      value: {
        dueKind: "date_only",
        title: "Giorno intero",
        priority: "medium",
        dueDateLocal: "2026-08-10",
      },
    });
    expect(
      validateTask({
        title: "Con ora",
        priority: "alta",
        due: "2026-08-10T17:00",
        timeZone: "Europe/Rome",
      }),
    ).toEqual({
      ok: true,
      value: {
        dueKind: "instant",
        title: "Con ora",
        priority: "high",
        dueAtUtc: new Date("2026-08-10T15:00:00.000Z"),
        originalTimeZone: "Europe/Rome",
      },
    });
  });

  it.each(["2026-03-29T02:30", "2026-10-25T02:30"])(
    "rejects a DST gap or fold instead of guessing: %s",
    (due) => {
      expect(
        validateTask({
          title: "Ora ambigua",
          priority: "alta",
          due,
          timeZone: "Europe/Rome",
        }),
      ).toEqual({ ok: false, issue: "ambiguous_local_time" });
    },
  );

  it("rejects missing separators, invalid dates, priorities and titles", () => {
    expect(
      parseDeterministicCommand("/task crea 2026-08-10 alta Titolo"),
    ).toEqual({ kind: "tasks.invalid" });
    expect(
      validateTask({
        title: "Titolo",
        priority: "urgente",
        due: "2026-08-10",
        timeZone: "Europe/Rome",
      }),
    ).toEqual({ ok: false, issue: "priority" });
    expect(
      validateTask({
        title: "Titolo",
        priority: "media",
        due: "2026-02-30",
        timeZone: "Europe/Rome",
      }),
    ).toEqual({ ok: false, issue: "date" });
    expect(
      validateTask({
        title: "\u0000",
        priority: "media",
        due: "nessuna",
        timeZone: "Europe/Rome",
      }),
    ).toEqual({ ok: false, issue: "title" });
  });

  it("round-trips every valid ISO date-only value", () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date("2000-01-01T00:00:00Z"),
          max: new Date("2099-12-31T00:00:00Z"),
          noInvalidDate: true,
        }),
        (date) => {
          const due = date.toISOString().slice(0, 10);
          const result = validateTask({
            title: "Property",
            priority: "media",
            due,
            timeZone: "Europe/Rome",
          });
          expect(result).toMatchObject({
            ok: true,
            value: { dueKind: "date_only", dueDateLocal: due },
          });
        },
      ),
    );
  });
});
