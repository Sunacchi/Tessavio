/**
 * Origine dell'entità: comando esplicito oppure proposta AI accettata.
 * È il campo che rende distinguibile un dato inserito da uno estratto.
 */
export type EntitySource = "manual_command" | "ai_proposal";

export const listUndoTtlMs = 15 * 60 * 1_000;
export const listCollectionLimit = 50;
export const listItemLimit = 100;

export type ListEntityKind = "list" | "item" | "note";
export type ListStatus = "active" | "deleted";
export type ListItemStatus = "open" | "completed" | "deleted";

interface VersionedRecord {
  readonly id: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export interface ListRecord extends VersionedRecord {
  readonly title: string;
  readonly source: EntitySource;
  readonly status: ListStatus;
}

export interface ListItemRecord extends VersionedRecord {
  readonly listId: string;
  readonly text: string;
  readonly source: EntitySource;
  readonly status: ListItemStatus;
  readonly completedAt: Date | null;
}

export interface NoteRecord extends VersionedRecord {
  readonly title: string;
  readonly body: string;
  readonly source: EntitySource;
  readonly status: ListStatus;
}

export interface ListWithItems {
  readonly list: ListRecord;
  readonly items: readonly ListItemRecord[];
  readonly truncated: boolean;
}

export interface ListValues {
  readonly title: string;
}

export interface ListItemValues {
  readonly text: string;
}

export interface NoteValues {
  readonly title: string;
  readonly body: string;
}

export type ListValidationIssue = "title" | "item_text" | "note_body";
export type ListValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ListValidationIssue };

function containsControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= 31 || point === 127);
  });
}

function boundedText(value: string, maximumLength: number): string | null {
  const cleaned = value.trim();
  return cleaned.length >= 1 &&
    cleaned.length <= maximumLength &&
    !containsControl(cleaned)
    ? cleaned
    : null;
}

export function validateListTitle(
  title: string,
): ListValidationResult<ListValues> {
  const value = boundedText(title, 100);
  return value === null
    ? { ok: false, issue: "title" }
    : { ok: true, value: { title: value } };
}

export function validateListItemText(
  text: string,
): ListValidationResult<ListItemValues> {
  const value = boundedText(text, 300);
  return value === null
    ? { ok: false, issue: "item_text" }
    : { ok: true, value: { text: value } };
}

export function validateNote(input: {
  readonly title: string;
  readonly body: string;
}): ListValidationResult<NoteValues> {
  const title = boundedText(input.title, 100);
  if (title === null) return { ok: false, issue: "title" };
  const body = boundedText(input.body, 4_000);
  if (body === null) return { ok: false, issue: "note_body" };
  return { ok: true, value: { title, body } };
}
