import type { EventCommand, EventDraftCommand } from "./deterministic-command";
import type {
  EventMutationContext,
  EventRepository,
  MutateEventResult,
  PreferenceRepository,
  ReminderRepository,
  TaskRepository,
  WorkRepository,
} from "./ports";
import { renderReminder } from "./manage-reminders";
import { renderTask } from "./manage-tasks";
import { renderBoundedSections, renderPlannedShift } from "./manage-work";
import {
  eventDayWindow,
  eventUndoTtlMs,
  validateDateOnlyEvent,
  validateInstantEvent,
  type EventRecord,
  type EventValidationIssue,
  type EventValues,
} from "../domains/events/events";
import type { PreferenceProfile } from "../domains/preferences/preferences";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";

export interface ManageEventsDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly events: EventRepository;
  readonly ids: IdGenerator;
  readonly preferences: PreferenceRepository;
  readonly reminders?: ReminderRepository;
  readonly tasks?: TaskRepository;
  readonly work?: WorkRepository;
}

export interface ManageEventsRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly sentAtUnix: number;
  readonly command: EventCommand;
}

const usage = [
  "Usa uno di questi comandi:",
  "/evento crea data YYYY-MM-DD | Titolo",
  "/evento crea ora YYYY-MM-DDTHH:mm YYYY-MM-DDTHH:mm | Titolo",
  "/evento leggi <id>",
  "/evento modifica <id> data YYYY-MM-DD | Titolo",
  "/evento modifica <id> ora YYYY-MM-DDTHH:mm YYYY-MM-DDTHH:mm | Titolo",
  "/evento annulla <id>",
  "/oggi oppure /domani",
].join("\n");

const missingPreferences =
  "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.";
const dayViewLimit = 50;

function validationMessage(issue: EventValidationIssue): string {
  switch (issue) {
    case "title":
      return `Titolo non valido: usa da 1 a 200 caratteri senza caratteri di controllo.\n${usage}`;
    case "date":
      return `Data non valida: usa YYYY-MM-DD.\n${usage}`;
    case "date_time":
      return `Data e ora non valide: usa YYYY-MM-DDTHH:mm.\n${usage}`;
    case "ambiguous_local_time":
      return "Ora locale inesistente o ambigua per il cambio DST. Scegli un'ora civile non ambigua.";
    case "interval":
      return "Intervallo non valido: la fine deve essere successiva all'inizio.";
    case "time_zone":
      return missingPreferences;
  }
}

function validateDraft(
  command: EventDraftCommand,
  profile: PreferenceProfile,
):
  | { readonly ok: true; readonly value: EventValues }
  | {
      readonly ok: false;
      readonly message: string;
    } {
  const result =
    command.representation === "date_only"
      ? validateDateOnlyEvent({
          title: command.title,
          localDate: command.localDate,
        })
      : validateInstantEvent({
          title: command.title,
          startLocal: command.startLocal,
          endLocal: command.endLocal,
          timeZone: profile.timeZone,
        });
  return result.ok
    ? result
    : { ok: false, message: validationMessage(result.issue) };
}

function formatInstant(value: Date, profile: PreferenceProfile): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: profile.timeZone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: profile.hourFormat === "24h" ? "h23" : "h12",
  }).format(value);
}

function renderEvent(event: EventRecord, profile: PreferenceProfile): string {
  const status = event.status === "cancelled" ? "annullato" : "attivo";
  const schedule =
    event.kind === "date_only"
      ? `Data: ${event.localDate}`
      : [
          `Inizio: ${formatInstant(event.startAtUtc, profile)}`,
          `Fine: ${formatInstant(event.endAtUtc, profile)}`,
          event.originalTimeZone === profile.timeZone
            ? `Timezone: ${event.originalTimeZone}`
            : `Timezone originale: ${event.originalTimeZone}; vista: ${profile.timeZone}`,
        ].join("\n");
  return [event.title, `ID: ${event.id}`, schedule, `Stato: ${status}`].join(
    "\n",
  );
}

function undoMessage(result: MutateEventResult, now: Date): string {
  if (!("event" in result)) return "";
  if (result.undoToken === null || result.undoExpiresAt === null) {
    return "Undo non più disponibile per questa modifica.";
  }
  if (result.undoExpiresAt.getTime() <= now.getTime()) {
    return "Undo scaduto per questa modifica.";
  }
  return `Undo entro 15 minuti: /annulla ${result.undoToken}`;
}

function mutationContext(
  request: ManageEventsRequest,
  dependencies: ManageEventsDependencies,
  now: Date,
): EventMutationContext {
  return {
    actorUserId: request.actorUserId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    auditId: dependencies.ids.newId(),
    undoToken: `evt_${dependencies.ids.newId()}`,
    now,
    undoExpiresAt: new Date(now.getTime() + eventUndoTtlMs),
  };
}

async function requirePreferences(
  request: ManageEventsRequest,
  dependencies: ManageEventsDependencies,
): Promise<PreferenceProfile | null> {
  return dependencies.preferences.get(request.scope);
}

export async function manageEvents(
  request: ManageEventsRequest,
  dependencies: ManageEventsDependencies,
): Promise<string> {
  const write =
    request.command.kind === "events.create" ||
    request.command.kind === "events.update" ||
    request.command.kind === "events.cancel";
  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: write ? "events:write" : "events:read",
  });

  if (request.command.kind === "events.invalid") return usage;
  const profile = await requirePreferences(request, dependencies);
  if (profile === null) return missingPreferences;

  const now = dependencies.clock.now();
  await dependencies.events.purgeExpiredUndo(request.scope, now, 100);

  if (request.command.kind === "events.read") {
    const event = await dependencies.events.get(
      request.scope,
      request.command.eventId,
    );
    return event === null
      ? "Evento non trovato per questo utente."
      : renderEvent(event, profile);
  }

  if (
    request.command.kind === "events.today" ||
    request.command.kind === "events.tomorrow"
  ) {
    if (dependencies.tasks !== undefined) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "tasks:read",
      });
    }
    if (dependencies.reminders !== undefined) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "reminders:read",
      });
    }
    if (dependencies.work !== undefined) {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "work:read",
      });
    }
    const window = eventDayWindow(
      request.sentAtUnix,
      profile.timeZone,
      request.command.kind === "events.today" ? 0 : 1,
    );
    const [eventRows, taskRows, reminderRows, workDay] = await Promise.all([
      dependencies.events.listForDay(request.scope, window, dayViewLimit + 1),
      dependencies.tasks?.listForDay(request.scope, window, dayViewLimit + 1) ??
        Promise.resolve([]),
      dependencies.reminders?.listForDay(
        request.scope,
        window,
        dayViewLimit + 1,
      ) ?? Promise.resolve([]),
      dependencies.work?.listForDay(request.scope, {
        startAtUtc: window.startAtUtc,
        endAtUtc: window.endAtUtc,
        timeZone: profile.timeZone,
      }) ??
        Promise.resolve({
          plannedShifts: [],
          workLogs: [],
          breaks: [],
          truncated: false,
          plannedShiftsTruncated: false,
        }),
    ]);
    const events = eventRows.slice(0, dayViewLimit);
    const tasks = taskRows.slice(0, dayViewLimit);
    const reminders = reminderRows.slice(0, dayViewLimit);
    const heading = request.command.kind === "events.today" ? "Oggi" : "Domani";
    if (
      events.length === 0 &&
      tasks.length === 0 &&
      reminders.length === 0 &&
      workDay.plannedShifts.length === 0
    ) {
      return `${heading} (${window.localDate}): nessun evento, task in scadenza, promemoria o turno pianificato.`;
    }
    const sections: string[] = [];
    if (events.length > 0) {
      sections.push(
        "Eventi:",
        ...events.map((event) => renderEvent(event, profile)),
      );
    }
    if (tasks.length > 0) {
      sections.push("Task:", ...tasks.map((task) => renderTask(task, profile)));
    }
    if (reminders.length > 0) {
      sections.push(
        "Promemoria:",
        ...reminders.map((reminder) => renderReminder(reminder, profile)),
      );
    }
    if (workDay.plannedShifts.length > 0) {
      sections.push(
        "Turni pianificati:",
        ...workDay.plannedShifts.map((shift) =>
          renderPlannedShift(shift, profile),
        ),
      );
    }
    return renderBoundedSections(
      `${heading} (${window.localDate}):`,
      sections,
      eventRows.length > dayViewLimit ||
        taskRows.length > dayViewLimit ||
        reminderRows.length > dayViewLimit ||
        workDay.plannedShiftsTruncated,
    );
  }

  if (request.command.kind === "events.cancel") {
    const result = await dependencies.events.cancel(
      request.scope,
      request.command.eventId,
      mutationContext(request, dependencies, now),
    );
    if (result.outcome === "not_found") {
      return "Evento non trovato per questo utente.";
    }
    if (result.outcome === "already_cancelled") {
      return "Evento già annullato: nessuna modifica applicata.";
    }
    if (!("event" in result)) return "Evento non modificato.";
    const heading =
      result.outcome === "duplicate"
        ? "Annullamento evento già applicato."
        : "Evento annullato.";
    return `${heading}\n${renderEvent(result.event, profile)}\n${undoMessage(result, now)}`;
  }

  const validated = validateDraft(request.command, profile);
  if (!validated.ok) return validated.message;
  const result =
    request.command.kind === "events.create"
      ? await dependencies.events.create(
          request.scope,
          dependencies.ids.newId(),
          validated.value,
          mutationContext(request, dependencies, now),
        )
      : await dependencies.events.update(
          request.scope,
          request.command.eventId,
          validated.value,
          mutationContext(request, dependencies, now),
        );
  if (result.outcome === "not_found") {
    return "Evento non trovato per questo utente.";
  }
  if (result.outcome === "already_cancelled") {
    return "Un evento annullato non può essere modificato. Usa prima il suo Undo, se ancora valido.";
  }
  if (!("event" in result)) return "Evento non modificato.";
  const heading =
    result.outcome === "duplicate"
      ? request.command.kind === "events.create"
        ? "Creazione evento già applicata."
        : "Modifica evento già applicata."
      : result.outcome === "created"
        ? "Evento creato."
        : "Evento aggiornato.";
  return `${heading}\n${renderEvent(result.event, profile)}\n${undoMessage(result, now)}`;
}
