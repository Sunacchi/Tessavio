import { describe, expect, it } from "vitest";
import {
  notesCommandRoutes,
  parseNotesCommand,
} from "../../src/application/commands/notes";

describe("C0.1 notes command parser", () => {
  it("parses create, update, read e delete", () => {
    expect(parseNotesCommand("/note crea | Titolo | Corpo")).toEqual({
      kind: "notes.create",
      title: " Titolo ",
      body: " Corpo",
    });
    expect(
      parseNotesCommand("/note modifica note-1 2 | Titolo | Corpo"),
    ).toEqual({
      kind: "notes.update",
      noteId: "note-1",
      expectedVersion: 2,
      title: " Titolo ",
      body: " Corpo",
    });
    expect(parseNotesCommand("/note leggi note-1")).toEqual({
      kind: "notes.read",
      noteId: "note-1",
    });
    expect(parseNotesCommand("/note elimina note-1 0")).toEqual({
      kind: "notes.invalid",
    });
  });

  it("registra soltanto /note", () => {
    expect(notesCommandRoutes.map(([keyword]) => keyword)).toEqual(["/note"]);
  });
});
