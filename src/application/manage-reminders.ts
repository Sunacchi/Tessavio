import {
  isOneOffReminderCommand,
  oneOffReminderCommandKinds,
  type OneOffReminderCommand,
} from "./commands/reminders";
import type { DayViewContributor } from "./day-view";
import {
  commandRegistration,
  type CommandContext,
  type CommandRegistration,
} from "./handler-registry";
import type { UndoHandler } from "./undo-registry";
import type {
  MutateReminderResult,
  PreferenceRepository,
  ReminderMutationContext,
  ReminderRepository,
} from "./ports";
import {
  reminderUndoTtlMs,
  validateReminder,
  type ReminderRecord,
} from "../domains/reminders/reminders";
import type { PreferenceProfile } from "../domains/preferences/preferences";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";

export interface ManageRemindersDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly preferences: PreferenceRepository;
  readonly reminders: ReminderRepository;
}

export interface ManageRemindersRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly sentAtUnix: number;
  readonly command: OneOffReminderCommand;
}

const usage = [
  "Usa uno di questi comandi:",
  "/promemoria crea YYYY-MM-DDTHH:mm | Testo",
  "/promemoria leggi <id>",
  "/promemoria lista",
  "/promemoria annulla <id>",
].join("\n");

function formatInstant(value: Date, profile: PreferenceProfile): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: profile.timeZone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: profile.hourFormat === "24h" ? "h23" : "h12",
  }).format(value);
}

export function renderReminder(
  reminder: ReminderRecord,
  profile: PreferenceProfile,
): string {
  const status: Record<ReminderRecord["status"], string> = {
    pending: "in attesa",
    claimed: "in consegna",
    sending: "in invio",
    sent: "inviato",
    cancelled: "annullato",
    permanent_failure: "non consegnabile",
    ambiguous: "esito invio incerto",
  };
  const adjusted =
    reminder.dueAtUtc.getTime() === reminder.requestedAtUtc.getTime()
      ? ""
      : `\nInvio rinviato dalle quiet hours: ${formatInstant(reminder.dueAtUtc, profile)}`;
  return [
    reminder.text,
    `ID: ${reminder.id}`,
    `Quando: ${formatInstant(reminder.requestedAtUtc, profile)}${adjusted}`,
    `Stato: ${status[reminder.status]}`,
  ].join("\n");
}

function mutationContext(
  request: ManageRemindersRequest,
  dependencies: ManageRemindersDependencies,
  now: Date,
): ReminderMutationContext {
  return {
    actorUserId: request.actorUserId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    auditId: dependencies.ids.newId(),
    undoToken: `rem_${dependencies.ids.newId()}`,
    now,
    undoExpiresAt: new Date(now.getTime() + reminderUndoTtlMs),
  };
}

function undoMessage(result: MutateReminderResult, now: Date): string {
  if (!("reminder" in result)) return "";
  if (result.undoToken === null || result.undoExpiresAt === null) {
    return "Undo non più disponibile per questa modifica.";
  }
  return result.undoExpiresAt.getTime() <= now.getTime()
    ? "Undo scaduto per questa modifica."
    : `Undo entro 15 minuti: /annulla ${result.undoToken}`;
}

export async function manageReminders(
  request: ManageRemindersRequest,
  dependencies: ManageRemindersDependencies,
): Promise<string> {
  const write =
    request.command.kind === "reminders.create" ||
    request.command.kind === "reminders.cancel";
  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: write ? "reminders:write" : "reminders:read",
  });
  if (request.command.kind === "reminders.invalid") return usage;
  const profile = await dependencies.preferences.get(request.scope);
  if (profile === null) {
    return "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.";
  }
  const now = dependencies.clock.now();
  await dependencies.reminders.purgeExpiredUndo(request.scope, now, 100);
  if (request.command.kind === "reminders.read") {
    const reminder = await dependencies.reminders.get(
      request.scope,
      request.command.reminderId,
    );
    return reminder === null
      ? "Promemoria non trovato per questo utente."
      : renderReminder(reminder, profile);
  }
  if (request.command.kind === "reminders.list") {
    const reminders = await dependencies.reminders.listPending(
      request.scope,
      50,
    );
    return reminders.length === 0
      ? "Nessun promemoria in attesa."
      : [
          "Promemoria in attesa:",
          ...reminders.map((reminder) => renderReminder(reminder, profile)),
        ].join("\n\n");
  }
  if (request.command.kind === "reminders.cancel") {
    const result = await dependencies.reminders.cancel(
      request.scope,
      request.command.reminderId,
      mutationContext(request, dependencies, now),
    );
    if (result.outcome === "not_found") {
      return "Promemoria non trovato per questo utente.";
    }
    if (result.outcome === "not_cancellable") {
      return "Promemoria non annullabile: è già in invio o concluso.";
    }
    if (!("reminder" in result)) return "Promemoria non modificato.";
    const heading =
      result.outcome === "duplicate"
        ? "Annullamento promemoria già applicato."
        : "Promemoria annullato.";
    return `${heading}\n${renderReminder(result.reminder, profile)}\n${undoMessage(result, now)}`;
  }
  const validated = validateReminder({
    text: request.command.text,
    scheduledLocal: request.command.scheduledLocal,
    timeZone: profile.timeZone,
    referenceInstant: new Date(request.sentAtUnix * 1_000),
  });
  if (!validated.ok) {
    switch (validated.issue) {
      case "text":
        return `Testo non valido: usa da 1 a 200 caratteri.\n${usage}`;
      case "date_time":
        return `Data e ora non valide: usa YYYY-MM-DDTHH:mm.\n${usage}`;
      case "ambiguous_local_time":
        return "Ora locale inesistente o ambigua per il cambio DST. Scegli un'ora civile non ambigua.";
      case "not_future":
        return "Il promemoria deve essere nel futuro rispetto al messaggio.";
      case "time_zone":
        return "Timezone non valida nelle impostazioni: correggila prima di creare il promemoria.";
    }
  }
  const result = await dependencies.reminders.create(
    request.scope,
    dependencies.ids.newId(),
    validated.value,
    mutationContext(request, dependencies, now),
  );
  if (!("reminder" in result)) return "Promemoria non creato.";
  const heading =
    result.outcome === "duplicate"
      ? "Creazione promemoria già applicata."
      : "Promemoria creato.";
  return `${heading}\n${renderReminder(result.reminder, profile)}\n${undoMessage(result, now)}`;
}

export interface ManageRemindersUndoDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly reminders: ReminderRepository;
}

export function reminderCommandRegistration(
  dependencies: ManageRemindersDependencies,
): CommandRegistration {
  return commandRegistration<OneOffReminderCommand>(
    oneOffReminderCommandKinds,
    isOneOffReminderCommand,
    (command, context) =>
      manageReminders(
        {
          actorUserId: context.actorUserId,
          scope: context.scope,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
          sentAtUnix: context.sentAtUnix,
          command,
        },
        dependencies,
      ),
  );
}

/** Contributo della slice promemoria alla vista di giornata. */
export function reminderDayViewContributor(dependencies: {
  readonly authorizer: Authorizer;
  readonly reminders: ReminderRepository;
}): DayViewContributor {
  return {
    collect: async (request) => {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "reminders:read",
      });
      const rows = await dependencies.reminders.listForDay(
        request.scope,
        request.window,
        request.limit + 1,
      );
      return {
        heading: "Promemoria:",
        entries: rows
          .slice(0, request.limit)
          .map((reminder) => renderReminder(reminder, request.profile)),
        truncated: rows.length > request.limit,
      };
    },
  };
}

/** La slice promemoria possiede il prefisso `rem_` dei token di Undo. */
export function reminderUndoHandler(
  dependencies: ManageRemindersUndoDependencies,
): UndoHandler {
  return {
    prefix: "rem_",
    handle: async (token: string, context: CommandContext) => {
      await dependencies.authorizer.authorize({
        actorUserId: context.actorUserId,
        scope: context.scope,
        action: "reminders:undo",
      });
      const result = await dependencies.reminders.undo(context.scope, token, {
        actorUserId: context.actorUserId,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        auditId: dependencies.ids.newId(),
        now: dependencies.clock.now(),
      });
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
    },
  };
}
