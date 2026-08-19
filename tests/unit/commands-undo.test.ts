import { describe, expect, it } from "vitest";
import {
  parseUndoCommand,
  undoCommandRoutes,
} from "../../src/application/commands/undo";

describe("C0.1 undo command parser", () => {
  it("accetta solo token opachi nella forma attesa", () => {
    expect(parseUndoCommand("/annulla evt_0123456789abcdef")).toEqual({
      kind: "undo",
      token: "evt_0123456789abcdef",
    });
    expect(parseUndoCommand("/annulla corto")).toEqual({
      kind: "undo.invalid",
    });
    expect(parseUndoCommand("/annulla")).toEqual({ kind: "undo.invalid" });
  });

  it("registra soltanto /annulla", () => {
    expect(undoCommandRoutes.map(([keyword]) => keyword)).toEqual(["/annulla"]);
  });
});
