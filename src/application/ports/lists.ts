import type {
  ListEntityKind,
  ListItemRecord,
  ListItemValues,
  ListRecord,
  ListValues,
  ListWithItems,
  NoteRecord,
  NoteValues,
} from "../../domains/lists/lists";
import type { EntityProvenance, UserScope } from "../../shared/contracts";

export interface ListMutationContext {
  readonly actorUserId: string;
  readonly provenance: EntityProvenance;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateListEntityResult<T> =
  | {
      readonly outcome:
        | "created"
        | "updated"
        | "deleted"
        | "completed"
        | "reopened"
        | "duplicate";
      readonly entity: T;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | {
      readonly outcome:
        | "not_found"
        | "stale"
        | "list_not_found"
        | "list_not_empty"
        | "already_completed"
        | "already_open";
    };

export type UndoListResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly entityKind: ListEntityKind;
      readonly entityId: string;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface ListRepository {
  getList(scope: UserScope, listId: string): Promise<ListWithItems | null>;
  listLists(scope: UserScope, limit: number): Promise<ListRecord[]>;
  listNotes(scope: UserScope, limit: number): Promise<NoteRecord[]>;
  getNote(scope: UserScope, noteId: string): Promise<NoteRecord | null>;
  createList(
    scope: UserScope,
    listId: string,
    values: ListValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>>;
  renameList(
    scope: UserScope,
    listId: string,
    expectedVersion: number,
    values: ListValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>>;
  deleteList(
    scope: UserScope,
    listId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>>;
  createItem(
    scope: UserScope,
    itemId: string,
    listId: string,
    values: ListItemValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>>;
  completeItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>>;
  reopenItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>>;
  deleteItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>>;
  createNote(
    scope: UserScope,
    noteId: string,
    values: NoteValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>>;
  updateNote(
    scope: UserScope,
    noteId: string,
    expectedVersion: number,
    values: NoteValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>>;
  deleteNote(
    scope: UserScope,
    noteId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<
      ListMutationContext,
      "undoToken" | "undoExpiresAt" | "provenance"
    >,
  ): Promise<UndoListResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}
