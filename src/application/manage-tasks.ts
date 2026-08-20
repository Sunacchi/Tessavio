import {
  isTaskCommand,
  taskCommandKinds,
  type TaskCommand,
} from "./commands/tasks";
import type { DayViewContributor } from "./day-view";
import {
  commandRegistration,
  type CommandContext,
  type CommandRegistration,
} from "./handler-registry";
import type { UndoHandler } from "./undo-registry";
import type { ProposalCandidateContributor } from "./ports/ai";
import type { PreferenceRepository } from "./ports/preferences";
import type {
  MutateTaskResult,
  TaskMutationContext,
  TaskRepository,
} from "./ports/tasks";
import {
  taskUndoTtlMs,
  validateTask,
  type TaskPriority,
  type TaskRecord,
  type TaskValidationIssue,
} from "../domains/tasks/tasks";
import type { PreferenceProfile } from "../domains/preferences/preferences";
import type { Authorizer } from "../security/authorization";
import type {
  Clock,
  EntityProvenance,
  IdGenerator,
  UserScope,
} from "../shared/contracts";

export interface ManageTasksDependencies {
  readonly authorizer: Authorizer;
  /** Origine dei dati scritti da questo contenitore: comando o proposta AI. */
  readonly provenance: EntityProvenance;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly preferences: PreferenceRepository;
  readonly tasks: TaskRepository;
}

export interface ManageTasksRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly command: TaskCommand;
}

const usage = [
  "Usa uno di questi comandi:",
  "/task crea <nessuna|YYYY-MM-DD|YYYY-MM-DDTHH:mm> | <bassa|media|alta> | Titolo",
  "/task leggi <id>",
  "/task lista",
  "/task completa <id>",
  "/task riapri <id>",
].join("\n");

const missingPreferences =
  "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.";

function validationMessage(issue: TaskValidationIssue): string {
  switch (issue) {
    case "title":
      return `Titolo non valido: usa da 1 a 200 caratteri senza caratteri di controllo.\n${usage}`;
    case "priority":
      return `Priorità non valida: usa bassa, media oppure alta.\n${usage}`;
    case "date":
      return `Data non valida: usa YYYY-MM-DD.\n${usage}`;
    case "date_time":
      return `Scadenza non valida: usa nessuna, YYYY-MM-DD oppure YYYY-MM-DDTHH:mm.\n${usage}`;
    case "ambiguous_local_time":
      return "Ora locale inesistente o ambigua per il cambio DST. Scegli un'ora civile non ambigua.";
    case "time_zone":
      return missingPreferences;
  }
}

function priorityLabel(priority: TaskPriority): string {
  switch (priority) {
    case "low":
      return "bassa";
    case "medium":
      return "media";
    case "high":
      return "alta";
  }
}

function formatInstant(value: Date, profile: PreferenceProfile): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: profile.timeZone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: profile.hourFormat === "24h" ? "h23" : "h12",
  }).format(value);
}

export function renderTask(
  task: TaskRecord,
  profile: PreferenceProfile,
): string {
  const due =
    task.dueKind === "none"
      ? "Scadenza: nessuna"
      : task.dueKind === "date_only"
        ? `Scadenza: ${task.dueDateLocal} (giorno intero)`
        : [
            `Scadenza: ${formatInstant(task.dueAtUtc, profile)}`,
            task.originalTimeZone === profile.timeZone
              ? `Timezone: ${task.originalTimeZone}`
              : `Timezone originale: ${task.originalTimeZone}; vista: ${profile.timeZone}`,
          ].join("\n");
  return [
    task.title,
    `ID: ${task.id}`,
    `Priorità: ${priorityLabel(task.priority)}`,
    due,
    `Stato: ${task.status === "open" ? "aperta" : "completata"}`,
  ].join("\n");
}

function undoMessage(result: MutateTaskResult, now: Date): string {
  if (!("task" in result)) return "";
  if (result.undoToken === null || result.undoExpiresAt === null) {
    return "Undo non più disponibile per questa modifica.";
  }
  if (result.undoExpiresAt.getTime() <= now.getTime()) {
    return "Undo scaduto per questa modifica.";
  }
  return `Undo entro 15 minuti: /annulla ${result.undoToken}`;
}

function mutationContext(
  request: ManageTasksRequest,
  dependencies: ManageTasksDependencies,
  now: Date,
): TaskMutationContext {
  return {
    actorUserId: request.actorUserId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    provenance: dependencies.provenance,
    auditId: dependencies.ids.newId(),
    undoToken: `tsk_${dependencies.ids.newId()}`,
    now,
    undoExpiresAt: new Date(now.getTime() + taskUndoTtlMs),
  };
}

export async function manageTasks(
  request: ManageTasksRequest,
  dependencies: ManageTasksDependencies,
): Promise<string> {
  const write =
    request.command.kind === "tasks.create" ||
    request.command.kind === "tasks.complete" ||
    request.command.kind === "tasks.reopen";
  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: write ? "tasks:write" : "tasks:read",
  });
  if (request.command.kind === "tasks.invalid") return usage;
  const profile = await dependencies.preferences.get(request.scope);
  if (profile === null) return missingPreferences;
  const now = dependencies.clock.now();
  await dependencies.tasks.purgeExpiredUndo(request.scope, now, 100);

  if (request.command.kind === "tasks.read") {
    const task = await dependencies.tasks.get(
      request.scope,
      request.command.taskId,
    );
    return task === null
      ? "Task non trovata per questo utente."
      : renderTask(task, profile);
  }
  if (request.command.kind === "tasks.list") {
    const tasks = await dependencies.tasks.listOpen(request.scope, 50);
    return tasks.length === 0
      ? "Task aperte: nessuna."
      : [
          "Task aperte:",
          ...tasks.map((task) => renderTask(task, profile)),
        ].join("\n\n");
  }
  if (request.command.kind === "tasks.create") {
    const validation = validateTask({
      title: request.command.title,
      priority: request.command.priority,
      due: request.command.due,
      timeZone: profile.timeZone,
    });
    if (!validation.ok) return validationMessage(validation.issue);
    const result = await dependencies.tasks.create(
      request.scope,
      dependencies.ids.newId(),
      validation.value,
      mutationContext(request, dependencies, now),
    );
    if (!("task" in result)) return "Task non creata.";
    const heading =
      result.outcome === "duplicate"
        ? "Creazione task già applicata."
        : "Task creata.";
    return `${heading}\n${renderTask(result.task, profile)}\n${undoMessage(result, now)}`;
  }

  const result =
    request.command.kind === "tasks.complete"
      ? await dependencies.tasks.complete(
          request.scope,
          request.command.taskId,
          mutationContext(request, dependencies, now),
        )
      : await dependencies.tasks.reopen(
          request.scope,
          request.command.taskId,
          mutationContext(request, dependencies, now),
        );
  if (result.outcome === "not_found") {
    return "Task non trovata per questo utente.";
  }
  if (result.outcome === "already_completed") {
    return "Task già completata: nessuna modifica applicata.";
  }
  if (result.outcome === "already_open") {
    return "Task già aperta: nessuna modifica applicata.";
  }
  if (!("task" in result)) return "Task non modificata.";
  const heading =
    result.outcome === "duplicate"
      ? "Modifica task già applicata."
      : result.outcome === "completed"
        ? "Task completata."
        : "Task riaperta.";
  return `${heading}\n${renderTask(result.task, profile)}\n${undoMessage(result, now)}`;
}

export interface ManageTasksUndoDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly tasks: TaskRepository;
}

export function taskCommandRegistration(
  dependencies: ManageTasksDependencies,
): CommandRegistration {
  return commandRegistration<TaskCommand>(
    taskCommandKinds,
    isTaskCommand,
    (command, context) =>
      manageTasks(
        {
          actorUserId: context.actorUserId,
          scope: context.scope,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
          command,
        },
        dependencies,
      ),
  );
}

/** Contributo della slice task alla vista di giornata. */
export function taskDayViewContributor(dependencies: {
  readonly authorizer: Authorizer;
  readonly tasks: TaskRepository;
}): DayViewContributor {
  return {
    collect: async (request) => {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "tasks:read",
      });
      const rows = await dependencies.tasks.listForDay(
        request.scope,
        request.window,
        request.limit + 1,
      );
      return {
        heading: "Task:",
        entries: rows
          .slice(0, request.limit)
          .map((task) => renderTask(task, request.profile)),
        truncated: rows.length > request.limit,
      };
    },
  };
}

/** La slice task possiede il prefisso `tsk_` dei token di Undo. */
export function taskUndoHandler(
  dependencies: ManageTasksUndoDependencies,
): UndoHandler {
  return {
    prefix: "tsk_",
    handle: async (token: string, context: CommandContext) => {
      await dependencies.authorizer.authorize({
        actorUserId: context.actorUserId,
        scope: context.scope,
        action: "tasks:undo",
      });
      const result = await dependencies.tasks.undo(context.scope, token, {
        actorUserId: context.actorUserId,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        auditId: dependencies.ids.newId(),
        now: dependencies.clock.now(),
      });
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
    },
  };
}

/** Candidate per risolvere un riferimento testuale a una task aperta. */
export function taskCandidateContributor(dependencies: {
  readonly authorizer: Authorizer;
  readonly tasks: TaskRepository;
}): ProposalCandidateContributor {
  return {
    domain: "tasks",
    collect: async (scope, context) => {
      await dependencies.authorizer.authorize({
        actorUserId: context.actorUserId,
        scope,
        action: "tasks:read",
      });
      const rows = await dependencies.tasks.listOpen(scope, context.limit);
      return rows.map((task) => ({ id: task.id, label: task.title }));
    },
  };
}
