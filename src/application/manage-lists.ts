import type { ListsCommand, NotesCommand } from "./deterministic-command";
import type {
  ListMutationContext,
  ListRepository,
  MutateListEntityResult,
} from "./ports";
import {
  listCollectionLimit,
  listItemLimit,
  listUndoTtlMs,
  validateListItemText,
  validateListTitle,
  validateNote,
  type ListItemRecord,
  type ListRecord,
  type ListValidationIssue,
  type ListWithItems,
  type NoteRecord,
} from "../domains/lists/lists";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";

export interface ManageListsDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly lists: ListRepository;
}

export interface ManageListsRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly command: ListsCommand | NotesCommand;
}

const listsUsage = [
  "Comandi liste:",
  "/liste crea | Titolo",
  "/liste leggi <lista-id>",
  "/liste lista",
  "/liste rinomina <lista-id> <versione> | Nuovo titolo",
  "/liste elimina <lista-id> <versione>",
  "/liste aggiungi <lista-id> | Testo item",
  "/liste spunta <item-id> <versione>",
  "/liste riapri <item-id> <versione>",
  "/liste rimuovi <item-id> <versione>",
].join("\n");

const notesUsage = [
  "Comandi note:",
  "/note crea | Titolo | Corpo",
  "/note leggi <nota-id>",
  "/note lista",
  "/note modifica <nota-id> <versione> | Titolo | Corpo",
  "/note elimina <nota-id> <versione>",
].join("\n");

function validationMessage(issue: ListValidationIssue): string {
  switch (issue) {
    case "title":
      return "Titolo non valido: usa da 1 a 100 caratteri senza caratteri di controllo.";
    case "item_text":
      return "Testo item non valido: usa da 1 a 300 caratteri senza caratteri di controllo.";
    case "note_body":
      return "Corpo nota non valido: usa da 1 a 4000 caratteri senza caratteri di controllo.";
  }
}

function mutationContext(
  request: ManageListsRequest,
  dependencies: ManageListsDependencies,
  now: Date,
): ListMutationContext {
  return {
    actorUserId: request.actorUserId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    auditId: dependencies.ids.newId(),
    undoToken: `lst_${dependencies.ids.newId()}`,
    now,
    undoExpiresAt: new Date(now.getTime() + listUndoTtlMs),
  };
}

function undoMessage<T>(result: MutateListEntityResult<T>, now: Date): string {
  if (!("entity" in result)) return "";
  if (
    result.undoToken === null ||
    result.undoExpiresAt === null ||
    result.undoExpiresAt.getTime() <= now.getTime()
  ) {
    return "Undo non disponibile.";
  }
  return `Undo entro 15 minuti: /annulla ${result.undoToken}`;
}

function renderListSummary(list: ListRecord): string {
  return [
    list.title,
    `ID: ${list.id}`,
    `Versione: ${String(list.version)}`,
    "Privata — provenienza: comando manuale",
  ].join("\n");
}

function renderItem(item: ListItemRecord): string {
  const marker = item.status === "completed" ? "[x]" : "[ ]";
  return `${marker} ${item.text}\nID item: ${item.id} — versione ${String(item.version)}`;
}

function renderListDetail(value: ListWithItems): string {
  const sections = value.items.map(renderItem);
  const body = sections.length === 0 ? "Nessun item." : sections.join("\n\n");
  const suffix = value.truncated
    ? `\n\nDettaglio parziale: mostrati i primi ${String(listItemLimit)} item.`
    : "";
  return `${renderListSummary(value.list)}\n\n${body}${suffix}`.slice(0, 3_800);
}

function renderNote(note: NoteRecord, includeBody: boolean): string {
  return [
    note.title,
    `ID: ${note.id}`,
    `Versione: ${String(note.version)}`,
    "Privata — provenienza: comando manuale",
    ...(includeBody ? ["", note.body] : []),
  ]
    .join("\n")
    .slice(0, 3_800);
}

function failureMessage(outcome: string): string | null {
  switch (outcome) {
    case "not_found":
      return "Elemento non trovato per questo utente.";
    case "stale":
      return "Modifica non applicata: la versione è cambiata. Rileggi l'elemento e riprova.";
    case "list_not_found":
      return "Lista non trovata per questo utente.";
    case "list_not_empty":
      return "Lista non eliminata: contiene ancora item non rimossi.";
    case "already_completed":
      return "Item già completato.";
    case "already_open":
      return "Item già aperto.";
    default:
      return null;
  }
}

function mutationReply<T>(
  result: MutateListEntityResult<T>,
  now: Date,
  labels: { readonly applied: string; readonly duplicate: string },
  render: (entity: T) => string,
): string {
  if (!("entity" in result)) {
    return failureMessage(result.outcome) ?? "Modifica non applicata.";
  }
  const heading =
    result.outcome === "duplicate" ? labels.duplicate : labels.applied;
  return `${heading}\n${render(result.entity)}\n${undoMessage(result, now)}`;
}

function isWrite(command: ListsCommand | NotesCommand): boolean {
  return ![
    "lists.read",
    "lists.list",
    "lists.invalid",
    "notes.read",
    "notes.list",
    "notes.invalid",
  ].includes(command.kind);
}

export async function manageLists(
  request: ManageListsRequest,
  dependencies: ManageListsDependencies,
): Promise<string> {
  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: isWrite(request.command) ? "lists:write" : "lists:read",
  });
  if (request.command.kind === "lists.invalid") return listsUsage;
  if (request.command.kind === "notes.invalid") return notesUsage;

  const now = dependencies.clock.now();
  await dependencies.lists.purgeExpiredUndo(request.scope, now, 100);
  const context = () => mutationContext(request, dependencies, now);

  switch (request.command.kind) {
    case "lists.read": {
      const value = await dependencies.lists.getList(
        request.scope,
        request.command.listId,
      );
      return value === null
        ? "Lista non trovata per questo utente."
        : renderListDetail(value);
    }
    case "lists.list": {
      const lists = await dependencies.lists.listLists(
        request.scope,
        listCollectionLimit + 1,
      );
      if (lists.length === 0) return "Liste private: nessuna.";
      const visible = lists.slice(0, listCollectionLimit);
      const suffix =
        lists.length > listCollectionLimit
          ? "\n\nElenco parziale: altre liste non mostrate."
          : "";
      return `Liste private:\n\n${visible.map(renderListSummary).join("\n\n")}${suffix}`.slice(
        0,
        3_800,
      );
    }
    case "lists.create": {
      const validation = validateListTitle(request.command.title);
      if (!validation.ok) return validationMessage(validation.issue);
      const result = await dependencies.lists.createList(
        request.scope,
        dependencies.ids.newId(),
        validation.value,
        context(),
      );
      return mutationReply(
        result,
        now,
        {
          applied: "Lista creata.",
          duplicate: "Creazione lista già applicata.",
        },
        renderListSummary,
      );
    }
    case "lists.rename": {
      const validation = validateListTitle(request.command.title);
      if (!validation.ok) return validationMessage(validation.issue);
      const result = await dependencies.lists.renameList(
        request.scope,
        request.command.listId,
        request.command.expectedVersion,
        validation.value,
        context(),
      );
      return mutationReply(
        result,
        now,
        { applied: "Lista rinominata.", duplicate: "Rinomina già applicata." },
        renderListSummary,
      );
    }
    case "lists.delete": {
      const result = await dependencies.lists.deleteList(
        request.scope,
        request.command.listId,
        request.command.expectedVersion,
        context(),
      );
      return mutationReply(
        result,
        now,
        {
          applied: "Lista eliminata.",
          duplicate: "Eliminazione lista già applicata.",
        },
        (list) => `ID: ${list.id}`,
      );
    }
    case "lists.item.create": {
      const validation = validateListItemText(request.command.text);
      if (!validation.ok) return validationMessage(validation.issue);
      const result = await dependencies.lists.createItem(
        request.scope,
        dependencies.ids.newId(),
        request.command.listId,
        validation.value,
        context(),
      );
      return mutationReply(
        result,
        now,
        {
          applied: "Item aggiunto.",
          duplicate: "Aggiunta item già applicata.",
        },
        renderItem,
      );
    }
    case "lists.item.complete":
    case "lists.item.reopen":
    case "lists.item.delete": {
      const operation =
        request.command.kind === "lists.item.complete"
          ? dependencies.lists.completeItem.bind(dependencies.lists)
          : request.command.kind === "lists.item.reopen"
            ? dependencies.lists.reopenItem.bind(dependencies.lists)
            : dependencies.lists.deleteItem.bind(dependencies.lists);
      const result = await operation(
        request.scope,
        request.command.itemId,
        request.command.expectedVersion,
        context(),
      );
      const labels =
        request.command.kind === "lists.item.complete"
          ? {
              applied: "Item completato.",
              duplicate: "Completamento già applicato.",
            }
          : request.command.kind === "lists.item.reopen"
            ? {
                applied: "Item riaperto.",
                duplicate: "Riapertura già applicata.",
              }
            : {
                applied: "Item rimosso.",
                duplicate: "Rimozione già applicata.",
              };
      return mutationReply(result, now, labels, renderItem);
    }
    case "notes.read": {
      const note = await dependencies.lists.getNote(
        request.scope,
        request.command.noteId,
      );
      return note === null
        ? "Nota non trovata per questo utente."
        : renderNote(note, true);
    }
    case "notes.list": {
      const notes = await dependencies.lists.listNotes(
        request.scope,
        listCollectionLimit + 1,
      );
      if (notes.length === 0) return "Note private: nessuna.";
      const visible = notes.slice(0, listCollectionLimit);
      const suffix =
        notes.length > listCollectionLimit
          ? "\n\nElenco parziale: altre note non mostrate."
          : "";
      return `Note private:\n\n${visible.map((note) => renderNote(note, false)).join("\n\n")}${suffix}`.slice(
        0,
        3_800,
      );
    }
    case "notes.create":
    case "notes.update": {
      const validation = validateNote(request.command);
      if (!validation.ok) return validationMessage(validation.issue);
      const result =
        request.command.kind === "notes.create"
          ? await dependencies.lists.createNote(
              request.scope,
              dependencies.ids.newId(),
              validation.value,
              context(),
            )
          : await dependencies.lists.updateNote(
              request.scope,
              request.command.noteId,
              request.command.expectedVersion,
              validation.value,
              context(),
            );
      return mutationReply(
        result,
        now,
        request.command.kind === "notes.create"
          ? {
              applied: "Nota creata.",
              duplicate: "Creazione nota già applicata.",
            }
          : {
              applied: "Nota modificata.",
              duplicate: "Modifica nota già applicata.",
            },
        (note) => renderNote(note, true),
      );
    }
    case "notes.delete": {
      const result = await dependencies.lists.deleteNote(
        request.scope,
        request.command.noteId,
        request.command.expectedVersion,
        context(),
      );
      return mutationReply(
        result,
        now,
        {
          applied: "Nota eliminata.",
          duplicate: "Eliminazione nota già applicata.",
        },
        (note) => `ID: ${note.id}`,
      );
    }
  }
}
