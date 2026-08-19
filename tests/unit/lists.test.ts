import { describe, expect, it } from "vitest";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import {
  validateListItemText,
  validateListTitle,
  validateNote,
} from "../../src/domains/lists/lists";

describe("B6.1 private lists and notes domain", () => {
  it("parses every bounded command shape and rejects malformed versions", () => {
    expect(parseDeterministicCommand("/liste crea | Spesa")).toEqual({
      kind: "lists.create",
      title: " Spesa",
    });
    expect(
      parseDeterministicCommand("/liste rinomina list-1 2 | Casa"),
    ).toEqual({
      kind: "lists.rename",
      listId: "list-1",
      expectedVersion: 2,
      title: " Casa",
    });
    expect(parseDeterministicCommand("/liste aggiungi list-1 | Latte")).toEqual(
      {
        kind: "lists.item.create",
        listId: "list-1",
        text: " Latte",
      },
    );
    expect(parseDeterministicCommand("/liste spunta item-1 1")).toEqual({
      kind: "lists.item.complete",
      itemId: "item-1",
      expectedVersion: 1,
    });
    expect(parseDeterministicCommand("/note crea | Titolo | Corpo")).toEqual({
      kind: "notes.create",
      title: " Titolo ",
      body: " Corpo",
    });
    expect(
      parseDeterministicCommand("/note modifica note-1 3 | Nuova | Testo"),
    ).toMatchObject({
      kind: "notes.update",
      noteId: "note-1",
      expectedVersion: 3,
    });
    expect(parseDeterministicCommand("/liste elimina list-1 0")).toEqual({
      kind: "lists.invalid",
    });
    expect(parseDeterministicCommand("/note crea | solo titolo")).toEqual({
      kind: "notes.invalid",
    });
  });

  it("trims valid text and enforces title, item and note limits", () => {
    expect(validateListTitle("  Spesa  ")).toEqual({
      ok: true,
      value: { title: "Spesa" },
    });
    expect(validateListItemText("  Latte  ")).toEqual({
      ok: true,
      value: { text: "Latte" },
    });
    expect(validateNote({ title: " Appunti ", body: " Corpo " })).toEqual({
      ok: true,
      value: { title: "Appunti", body: "Corpo" },
    });
    expect(validateListTitle("x".repeat(101))).toEqual({
      ok: false,
      issue: "title",
    });
    expect(validateListItemText("x".repeat(301))).toEqual({
      ok: false,
      issue: "item_text",
    });
    expect(validateNote({ title: "ok", body: "x".repeat(4_001) })).toEqual({
      ok: false,
      issue: "note_body",
    });
    expect(validateNote({ title: "ok", body: "unsafe\u0000" })).toEqual({
      ok: false,
      issue: "note_body",
    });
  });
});
