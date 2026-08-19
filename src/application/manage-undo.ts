import type { UndoCommand } from "./deterministic-command";
import { managePreferences } from "./manage-preferences";
import type {
  EventRepository,
  FinanceRepository,
  ListRepository,
  PreferenceRepository,
  ReminderRecurrenceRepository,
  ReminderRepository,
  TaskRepository,
  WorkRepository,
} from "./ports";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";

export interface ManageUndoDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly events: EventRepository;
  readonly finance?: FinanceRepository;
  readonly ids: IdGenerator;
  readonly lists?: ListRepository;
  readonly preferences: PreferenceRepository;
  readonly recurrences?: ReminderRecurrenceRepository;
  readonly reminders: ReminderRepository;
  readonly tasks: TaskRepository;
  readonly work?: WorkRepository;
}

export interface ManageUndoRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly command: UndoCommand;
}

export async function manageUndo(
  request: ManageUndoRequest,
  dependencies: ManageUndoDependencies,
): Promise<string> {
  if (request.command.kind === "undo.invalid") {
    await dependencies.authorizer.authorize({
      actorUserId: request.actorUserId,
      scope: request.scope,
      action: "events:undo",
    });
    return "Usa: /annulla <token-opaco>";
  }

  if (!request.command.token.startsWith("evt_")) {
    if (request.command.token.startsWith("lst_")) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "lists:undo",
      });
      const lists = dependencies.lists;
      if (lists === undefined) return "Undo liste/note non disponibile.";
      const result = await lists.undo(request.scope, request.command.token, {
        actorUserId: request.actorUserId,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        auditId: dependencies.ids.newId(),
        now: dependencies.clock.now(),
      });
      switch (result.outcome) {
        case "reverted":
          return `Modifica ${result.entityKind} annullata. ID: ${result.entityId}`;
        case "duplicate":
          return `Undo liste/note già applicato (${result.entityKind}). ID: ${result.entityId}`;
        case "expired":
          return "Undo liste/note scaduto: nessuna modifica applicata.";
        case "used":
          return "Undo liste/note già usato: nessuna modifica applicata.";
        case "stale":
          return "Undo liste/note non applicabile: l'elemento è cambiato o ha dati collegati.";
        case "not_found":
          return "Undo liste/note non disponibile per questo utente.";
      }
    }
    if (request.command.token.startsWith("fin_")) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "finance:undo",
      });
      const finance = dependencies.finance;
      if (finance === undefined) return "Undo finanze non disponibile.";
      const result = await finance.undo(request.scope, request.command.token, {
        actorUserId: request.actorUserId,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        auditId: dependencies.ids.newId(),
        now: dependencies.clock.now(),
      });
      switch (result.outcome) {
        case "reverted":
          return result.entry === null
            ? "Creazione movimento annullata."
            : `Modifica movimento annullata. ID: ${result.entry.id}`;
        case "duplicate":
          return result.entry === null
            ? "Undo finanze già applicato: il movimento non esiste."
            : `Undo finanze già applicato. ID: ${result.entry.id}`;
        case "expired":
          return "Undo finanze scaduto: nessuna modifica applicata.";
        case "used":
          return "Undo finanze già usato: nessuna modifica applicata.";
        case "stale":
          return "Undo finanze non applicabile: il movimento è cambiato nel frattempo.";
        case "not_found":
          return "Undo finanze non disponibile per questo utente.";
      }
    }
    if (request.command.token.startsWith("wrk_")) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "work:undo",
      });
      const work = dependencies.work;
      if (work === undefined) return "Undo lavoro non disponibile.";
      const result = await work.undo(request.scope, request.command.token, {
        actorUserId: request.actorUserId,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        auditId: dependencies.ids.newId(),
        now: dependencies.clock.now(),
      });
      switch (result.outcome) {
        case "reverted":
          return `Creazione lavoro annullata (${result.entityKind}). ID: ${result.entityId}`;
        case "duplicate":
          return `Undo lavoro già applicato (${result.entityKind}). ID: ${result.entityId}`;
        case "expired":
          return "Undo lavoro scaduto: nessuna modifica applicata.";
        case "used":
          return "Undo lavoro già usato: nessuna modifica applicata.";
        case "stale":
          return "Undo lavoro non applicabile: l'entità è cambiata o ha dati collegati.";
        case "not_found":
          return "Undo lavoro non disponibile per questo utente.";
      }
    }
    if (request.command.token.startsWith("tsk_")) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "tasks:undo",
      });
      const result = await dependencies.tasks.undo(
        request.scope,
        request.command.token,
        {
          actorUserId: request.actorUserId,
          correlationId: request.correlationId,
          idempotencyKey: request.idempotencyKey,
          auditId: dependencies.ids.newId(),
          now: dependencies.clock.now(),
        },
      );
      switch (result.outcome) {
        case "reverted":
          return result.task === null
            ? "Creazione task annullata."
            : `Modifica task annullata. ID: ${result.task.id}`;
        case "duplicate":
          return result.task === null
            ? "Undo task già applicato: la task non esiste."
            : `Undo task già applicato. ID: ${result.task.id}`;
        case "expired":
          return "Undo task scaduto: nessuna modifica applicata.";
        case "used":
          return "Undo task già usato: nessuna modifica applicata.";
        case "stale":
          return "Undo task non applicabile: la task è cambiata nel frattempo.";
        case "not_found":
          return "Undo task non disponibile per questo utente.";
      }
    }
    if (request.command.token.startsWith("rec_")) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "reminders:undo",
      });
      const recurrences = dependencies.recurrences;
      if (recurrences === undefined) return "Undo ricorrenza non disponibile.";
      const result = await recurrences.undo(
        request.scope,
        request.command.token,
        {
          actorUserId: request.actorUserId,
          correlationId: request.correlationId,
          idempotencyKey: request.idempotencyKey,
          auditId: dependencies.ids.newId(),
          now: dependencies.clock.now(),
        },
      );
      switch (result.outcome) {
        case "reverted":
          return result.recurrence === null
            ? "Creazione ricorrenza annullata."
            : `Arresto ricorrenza revocato. ID: ${result.recurrence.id}`;
        case "duplicate":
          return result.recurrence === null
            ? "Undo ricorrenza già applicato: la regola non esiste."
            : `Undo ricorrenza già applicato. ID: ${result.recurrence.id}`;
        case "expired":
          return "Undo ricorrenza scaduto: nessuna modifica applicata.";
        case "used":
          return "Undo ricorrenza già usato: nessuna modifica applicata.";
        case "stale":
          return "Undo ricorrenza non applicabile: la regola è cambiata o ha già generato occorrenze.";
        case "not_found":
          return "Undo ricorrenza non disponibile per questo utente.";
      }
    }
    if (request.command.token.startsWith("rem_")) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "reminders:undo",
      });
      const result = await dependencies.reminders.undo(
        request.scope,
        request.command.token,
        {
          actorUserId: request.actorUserId,
          correlationId: request.correlationId,
          idempotencyKey: request.idempotencyKey,
          auditId: dependencies.ids.newId(),
          now: dependencies.clock.now(),
        },
      );
      switch (result.outcome) {
        case "reverted":
          return result.reminder === null
            ? "Creazione promemoria annullata."
            : `Annullamento promemoria revocato. ID: ${result.reminder.id}`;
        case "duplicate":
          return result.reminder === null
            ? "Undo promemoria già applicato: il promemoria non esiste."
            : `Undo promemoria già applicato. ID: ${result.reminder.id}`;
        case "expired":
          return "Undo promemoria scaduto: nessuna modifica applicata.";
        case "used":
          return "Undo promemoria già usato: nessuna modifica applicata.";
        case "stale":
          return "Undo promemoria non applicabile: il promemoria è cambiato nel frattempo.";
        case "not_found":
          return "Undo promemoria non disponibile per questo utente.";
      }
    }
    return managePreferences(
      {
        actorUserId: request.actorUserId,
        scope: request.scope,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        command: {
          kind: "preferences.undo",
          token: request.command.token,
        },
      },
      dependencies,
    );
  }

  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: "events:undo",
  });
  const now = dependencies.clock.now();
  const result = await dependencies.events.undo(
    request.scope,
    request.command.token,
    {
      actorUserId: request.actorUserId,
      correlationId: request.correlationId,
      idempotencyKey: request.idempotencyKey,
      auditId: dependencies.ids.newId(),
      now,
    },
  );
  switch (result.outcome) {
    case "reverted":
      return result.event === null
        ? "Creazione evento annullata."
        : `Modifica evento annullata. ID: ${result.event.id}`;
    case "duplicate":
      return result.event === null
        ? "Undo evento già applicato: l'evento non esiste."
        : `Undo evento già applicato. ID: ${result.event.id}`;
    case "expired":
      return "Undo evento scaduto: nessuna modifica applicata.";
    case "used":
      return "Undo evento già usato: nessuna modifica applicata.";
    case "stale":
      return "Undo evento non applicabile: l'evento è cambiato nel frattempo.";
    case "not_found":
      return "Undo evento non disponibile per questo utente.";
  }
}
