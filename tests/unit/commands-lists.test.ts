import { describe, expect, it } from "vitest";
import {
  listsCommandRoutes,
  parseListsCommand,
} from "../../src/application/commands/lists";

describe("C0.1 lists command parser", () => {
  it("parses list and item shapes con versione attesa", () => {
    expect(parseListsCommand("/liste crea | Spesa")).toEqual({
      kind: "lists.create",
      title: " Spesa",
    });
    expect(parseListsCommand("/liste aggiungi list-1 | Latte")).toEqual({
      kind: "lists.item.create",
      listId: "list-1",
      text: " Latte",
    });
    expect(parseListsCommand("/liste spunta item-1 1")).toEqual({
      kind: "lists.item.complete",
      itemId: "item-1",
      expectedVersion: 1,
    });
    expect(parseListsCommand("/liste elimina list-1 abc")).toEqual({
      kind: "lists.invalid",
    });
  });

  it("registra soltanto /liste", () => {
    expect(listsCommandRoutes.map(([keyword]) => keyword)).toEqual(["/liste"]);
  });
});
