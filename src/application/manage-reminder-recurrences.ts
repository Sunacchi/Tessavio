import {
  isReminderRecurrenceCommand,
  reminderRecurrenceCommandKinds,
  type ReminderRecurrenceCommand,
} from "./commands/reminders";
import {
  commandRegistration,
  type CommandContext,
  type CommandRegistration,
} from "./handler-registry";
import type { UndoHandler } from "./undo-registry";
import type { PreferenceRepository } from "./ports/preferences";
import type {
  MutateReminderRecurrenceResult,
  ReminderRecurrenceMutationContext,
  ReminderRecurrenceRepository,
} from "./ports/recurrences";
import {
  reminderRecurrenceUndoTtlMs,
  validateReminderRecurrence,
  type ReminderRecurrenceRecord,
} from "../domains/reminders/recurrence";
import type { PreferenceProfile } from "../domains/preferences/preferences";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";

export interface ManageReminderRecurrencesDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly preferences: PreferenceRepository;
  readonly recurrences: ReminderRecurrenceRepository;
}

export interface ManageReminderRecurrencesRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly sentAtUnix: number;
  readonly command: ReminderRecurrenceCommand;
}

const usage = [
  "Usa uno di questi comandi:",
  "/promemoria ricorrente <giornaliero|settimanale> YYYY-MM-DDTHH:mm | Testo",
  "/promemoria ricorrenza <id>",
  "/promemoria ricorrenze",
  "/promemoria ferma <id> <versione>",
].join("\n");

function formatInstant(value: Date, profile: PreferenceProfile): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: profile.timeZone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: profile.hourFormat === "24h" ? "h23" : "h12",
  }).format(value);
}

function renderRecurrence(
  recurrence: ReminderRecurrenceRecord,
  profile: PreferenceProfile,
): string {
  const frequency =
    recurrence.frequency === "daily" ? "giornaliera" : "settimanale";
  const status = recurrence.status === "active" ? "attiva" : "fermata";
  return [
    recurrence.text,
    `ID ricorrenza: ${recurrence.id}`,
    `Frequenza: ${frequency} alle ${recurrence.localTime} (${recurrence.timeZone})`,
    `Prossima: ${formatInstant(recurrence.nextDueAtUtc, profile)}`,
    `Stato: ${status}`,
    `Versione: ${String(recurrence.version)}`,
  ].join("\n");
}

function mutationContext(
  request: ManageReminderRecurrencesRequest,
  dependencies: ManageReminderRecurrencesDependencies,
  now: Date,
): ReminderRecurrenceMutationContext {
  return {
    actorUserId: request.actorUserId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    auditId: dependencies.ids.newId(),
    undoToken: `rec_${dependencies.ids.newId()}`,
    now,
    undoExpiresAt: new Date(now.getTime() + reminderRecurrenceUndoTtlMs),
  };
}

function undoMessage(
  result: MutateReminderRecurrenceResult,
  now: Date,
): string {
  if (!("recurrence" in result)) return "";
  if (result.undoToken === null || result.undoExpiresAt === null) {
    return "Undo non più disponibile per questa modifica.";
  }
  return result.undoExpiresAt.getTime() <= now.getTime()
    ? "Undo scaduto per questa modifica."
    : `Undo entro 15 minuti: /annulla ${result.undoToken}`;
}

export async function manageReminderRecurrences(
  request: ManageReminderRecurrencesRequest,
  dependencies: ManageReminderRecurrencesDependencies,
): Promise<string> {
  const write =
    request.command.kind === "reminders.recurrence.create" ||
    request.command.kind === "reminders.recurrence.cancel";
  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: write ? "reminders:write" : "reminders:read",
  });
  const profile = await dependencies.preferences.get(request.scope);
  if (profile === null) {
    return "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.";
  }
  const now = dependencies.clock.now();
  await dependencies.recurrences.purgeExpiredUndo(request.scope, now, 100);
  if (request.command.kind === "reminders.recurrence.read") {
    const recurrence = await dependencies.recurrences.get(
      request.scope,
      request.command.recurrenceId,
    );
    return recurrence === null
      ? "Ricorrenza non trovata per questo utente."
      : renderRecurrence(recurrence, profile);
  }
  if (request.command.kind === "reminders.recurrence.list") {
    const recurrences = await dependencies.recurrences.listActive(
      request.scope,
      50,
    );
    return recurrences.length === 0
      ? "Nessuna ricorrenza attiva."
      : [
          "Ricorrenze attive:",
          ...recurrences.map((value) => renderRecurrence(value, profile)),
        ].join("\n\n");
  }
  if (request.command.kind === "reminders.recurrence.cancel") {
    const result = await dependencies.recurrences.cancel(
      request.scope,
      request.command.recurrenceId,
      request.command.expectedVersion,
      mutationContext(request, dependencies, now),
    );
    if (result.outcome === "not_found") {
      return "Ricorrenza non trovata per questo utente.";
    }
    if (result.outcome === "stale") {
      return "Versione non aggiornata: rileggi la ricorrenza prima di fermarla.";
    }
    if (result.outcome === "not_cancellable") {
      return "Ricorrenza già fermata.";
    }
    if (!("recurrence" in result)) return "Ricorrenza non modificata.";
    const heading =
      result.outcome === "duplicate"
        ? "Arresto ricorrenza già applicato."
        : "Ricorrenza fermata.";
    return `${heading}\n${renderRecurrence(result.recurrence, profile)}\n${undoMessage(result, now)}`;
  }
  const validated = validateReminderRecurrence({
    text: request.command.text,
    frequency: request.command.frequency,
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
      case "not_future":
        return "La prima occorrenza deve essere nel futuro rispetto al messaggio.";
      case "time_zone":
        return "Timezone non valida nelle impostazioni: correggila prima di creare la ricorrenza.";
    }
  }
  const result = await dependencies.recurrences.create(
    request.scope,
    dependencies.ids.newId(),
    validated.value,
    mutationContext(request, dependencies, now),
  );
  if (!("recurrence" in result)) return "Ricorrenza non creata.";
  const heading =
    result.outcome === "duplicate"
      ? "Creazione ricorrenza già applicata."
      : "Ricorrenza creata.";
  return `${heading}\n${renderRecurrence(result.recurrence, profile)}\n${undoMessage(result, now)}`;
}

export interface ManageReminderRecurrencesUndoDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly recurrences: ReminderRecurrenceRepository;
}

export function reminderRecurrenceCommandRegistration(
  dependencies: ManageReminderRecurrencesDependencies,
): CommandRegistration {
  return commandRegistration<ReminderRecurrenceCommand>(
    reminderRecurrenceCommandKinds,
    isReminderRecurrenceCommand,
    (command, context) =>
      manageReminderRecurrences(
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

/** La slice ricorrenze possiede il prefisso `rec_` dei token di Undo. */
export function reminderRecurrenceUndoHandler(
  dependencies: ManageReminderRecurrencesUndoDependencies,
): UndoHandler {
  return {
    prefix: "rec_",
    handle: async (token: string, context: CommandContext) => {
      await dependencies.authorizer.authorize({
        actorUserId: context.actorUserId,
        scope: context.scope,
        action: "reminders:undo",
      });
      const result = await dependencies.recurrences.undo(context.scope, token, {
        actorUserId: context.actorUserId,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        auditId: dependencies.ids.newId(),
        now: dependencies.clock.now(),
      });
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
    },
  };
}
