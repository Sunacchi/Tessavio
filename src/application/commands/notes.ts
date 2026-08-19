import {
  commandParts,
  entityIdPattern,
  parsePositiveVersion,
  type CommandRoute,
} from "./shared";

export type NotesCommand =
  | {
      readonly kind: "notes.create";
      readonly title: string;
      readonly body: string;
    }
  | { readonly kind: "notes.read"; readonly noteId: string }
  | { readonly kind: "notes.list" }
  | {
      readonly kind: "notes.update";
      readonly noteId: string;
      readonly expectedVersion: number;
      readonly title: string;
      readonly body: string;
    }
  | {
      readonly kind: "notes.delete";
      readonly noteId: string;
      readonly expectedVersion: number;
    }
  | { readonly kind: "notes.invalid" };

export function parseNotesCommand(text: string): NotesCommand {
  const sections = text.split("|");
  const commandText = sections[0]?.trim() ?? "";
  const parts = commandParts(commandText);
  const operation = parts[1]?.toLowerCase();

  if (sections.length === 3) {
    const title = sections[1] ?? "";
    const body = sections[2] ?? "";
    if (operation === "crea" && parts.length === 2) {
      return { kind: "notes.create", title, body };
    }
    const expectedVersion = parsePositiveVersion(parts[3]);
    if (
      operation === "modifica" &&
      parts.length === 4 &&
      entityIdPattern.test(parts[2] ?? "") &&
      expectedVersion !== null
    ) {
      return {
        kind: "notes.update",
        noteId: parts[2] ?? "",
        expectedVersion,
        title,
        body,
      };
    }
    return { kind: "notes.invalid" };
  }
  if (sections.length !== 1) return { kind: "notes.invalid" };
  if (operation === "lista" && parts.length === 2) {
    return { kind: "notes.list" };
  }
  if (
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "notes.read", noteId: parts[2] ?? "" };
  }
  const expectedVersion = parsePositiveVersion(parts[3]);
  if (
    operation === "elimina" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[2] ?? "") &&
    expectedVersion !== null
  ) {
    return {
      kind: "notes.delete",
      noteId: parts[2] ?? "",
      expectedVersion,
    };
  }
  return { kind: "notes.invalid" };
}

export const notesCommandRoutes: readonly CommandRoute<NotesCommand>[] = [
  ["/note", parseNotesCommand],
];
