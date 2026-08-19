import {
  commandParts,
  entityIdPattern,
  parsePositiveVersion,
  type CommandRoute,
} from "./shared";

export type ListsCommand =
  | { readonly kind: "lists.create"; readonly title: string }
  | { readonly kind: "lists.read"; readonly listId: string }
  | { readonly kind: "lists.list" }
  | {
      readonly kind: "lists.rename";
      readonly listId: string;
      readonly expectedVersion: number;
      readonly title: string;
    }
  | {
      readonly kind: "lists.delete";
      readonly listId: string;
      readonly expectedVersion: number;
    }
  | {
      readonly kind: "lists.item.create";
      readonly listId: string;
      readonly text: string;
    }
  | {
      readonly kind: "lists.item.complete";
      readonly itemId: string;
      readonly expectedVersion: number;
    }
  | {
      readonly kind: "lists.item.reopen";
      readonly itemId: string;
      readonly expectedVersion: number;
    }
  | {
      readonly kind: "lists.item.delete";
      readonly itemId: string;
      readonly expectedVersion: number;
    }
  | { readonly kind: "lists.invalid" };

export function parseListsCommand(text: string): ListsCommand {
  const sections = text.split("|");
  const commandText = sections[0]?.trim() ?? "";
  const parts = commandParts(commandText);
  const operation = parts[1]?.toLowerCase();

  if (sections.length === 2) {
    const content = sections[1] ?? "";
    if (operation === "crea" && parts.length === 2) {
      return { kind: "lists.create", title: content };
    }
    const expectedVersion = parsePositiveVersion(parts[3]);
    if (
      operation === "rinomina" &&
      parts.length === 4 &&
      entityIdPattern.test(parts[2] ?? "") &&
      expectedVersion !== null
    ) {
      return {
        kind: "lists.rename",
        listId: parts[2] ?? "",
        expectedVersion,
        title: content,
      };
    }
    if (
      operation === "aggiungi" &&
      parts.length === 3 &&
      entityIdPattern.test(parts[2] ?? "")
    ) {
      return {
        kind: "lists.item.create",
        listId: parts[2] ?? "",
        text: content,
      };
    }
    return { kind: "lists.invalid" };
  }
  if (sections.length !== 1) return { kind: "lists.invalid" };

  if (operation === "lista" && parts.length === 2) {
    return { kind: "lists.list" };
  }
  if (
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "lists.read", listId: parts[2] ?? "" };
  }
  const expectedVersion = parsePositiveVersion(parts[3]);
  if (
    parts.length === 4 &&
    entityIdPattern.test(parts[2] ?? "") &&
    expectedVersion !== null
  ) {
    if (operation === "elimina") {
      return {
        kind: "lists.delete",
        listId: parts[2] ?? "",
        expectedVersion,
      };
    }
    const itemKind =
      operation === "spunta"
        ? "lists.item.complete"
        : operation === "riapri"
          ? "lists.item.reopen"
          : operation === "rimuovi"
            ? "lists.item.delete"
            : null;
    if (itemKind !== null) {
      return {
        kind: itemKind,
        itemId: parts[2] ?? "",
        expectedVersion,
      };
    }
  }
  return { kind: "lists.invalid" };
}

export const listsCommandRoutes: readonly CommandRoute<ListsCommand>[] = [
  ["/liste", parseListsCommand],
];
