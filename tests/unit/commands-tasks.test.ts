import { describe, expect, it } from "vitest";
import {
  parseTaskCommand,
  taskCommandRoutes,
} from "../../src/application/commands/tasks";

describe("C0.1 task command parser", () => {
  it("parses create, list and transition shapes", () => {
    expect(
      parseTaskCommand("/task crea 2026-08-20 | alta | Relazione"),
    ).toEqual({
      kind: "tasks.create",
      due: "2026-08-20",
      priority: " alta ",
      title: " Relazione",
    });
    expect(parseTaskCommand("/task lista")).toEqual({ kind: "tasks.list" });
    expect(parseTaskCommand("/task completa tsk-1")).toEqual({
      kind: "tasks.complete",
      taskId: "tsk-1",
    });
    expect(parseTaskCommand("/task riapri tsk-1")).toEqual({
      kind: "tasks.reopen",
      taskId: "tsk-1",
    });
    expect(parseTaskCommand("/task crea 2026-08-20 | alta")).toEqual({
      kind: "tasks.invalid",
    });
  });

  it("registra soltanto /task", () => {
    expect(taskCommandRoutes.map(([keyword]) => keyword)).toEqual(["/task"]);
  });
});
