import { createCommandRegistry } from "../application/handler-registry";
import {
  eventCommandRegistration,
  eventUndoHandler,
} from "../application/manage-events";
import {
  financeCommandRegistration,
  financeUndoHandler,
} from "../application/manage-finance";
import {
  listsCommandRegistration,
  listsUndoHandler,
} from "../application/manage-lists";
import { onboardingCommandRegistration } from "../application/manage-onboarding";
import {
  preferenceCommandRegistration,
  preferenceUndoHandler,
} from "../application/manage-preferences";
import {
  reminderRecurrenceCommandRegistration,
  reminderRecurrenceUndoHandler,
} from "../application/manage-reminder-recurrences";
import {
  reminderCommandRegistration,
  reminderDayViewContributor,
  reminderUndoHandler,
} from "../application/manage-reminders";
import { reportCommandRegistration } from "../application/manage-reports";
import {
  taskCommandRegistration,
  taskDayViewContributor,
  taskUndoHandler,
} from "../application/manage-tasks";
import { undoCommandRegistration } from "../application/manage-undo";
import {
  workCommandRegistration,
  workDayViewContributor,
  workUndoHandler,
} from "../application/manage-work";
import type { TelegramReplyPort } from "../application/ports/telegram";
import type { ProcessAiProposalDependencies } from "../application/process-ai-proposal";
import type { ProcessInboundDependencies } from "../application/process-inbound";
import { SelfScopeAuthorizer } from "../security/authorization";
import type { AppConfig } from "../shared/config";
import type { Clock, IdGenerator } from "../shared/contracts";
import { buildAiRuntime } from "./ai-runtime";
import {
  createSliceRepositories,
  type SliceRepositories,
} from "./repositories";

export interface InboundRuntime {
  readonly dependencies: ProcessInboundDependencies;
  readonly repositories: SliceRepositories;
  readonly aiJob: ProcessAiProposalDependencies | null;
}

/**
 * Composition root del consumer: è l'unico punto che nomina tutte le slice.
 * Una slice assente qui semplicemente non è registrata, e il registry risponde
 * che la funzione non è disponibile invece di lanciare.
 */
export function buildInboundRuntime(
  env: Env,
  config: AppConfig,
  runtime: {
    readonly clock: Clock;
    readonly ids: IdGenerator;
    readonly reply: TelegramReplyPort;
  },
): InboundRuntime {
  const { clock, ids, reply } = runtime;
  const authorizer = new SelfScopeAuthorizer();
  const repositories = createSliceRepositories(env);
  const {
    effects,
    events,
    finance,
    lists,
    preferences,
    recurrences,
    reminders,
    tasks,
    work,
  } = repositories;

  const ai = buildAiRuntime({
    env,
    config,
    authorizer,
    clock,
    ids,
    reply,
    repositories,
  });

  const commands = createCommandRegistry([
    onboardingCommandRegistration({ authorizer, clock, effects }),
    preferenceCommandRegistration({ authorizer, clock, ids, preferences }),
    eventCommandRegistration({
      authorizer,
      clock,
      events,
      ids,
      preferences,
      provenance: "entered",
      dayViewContributors: [
        taskDayViewContributor({ authorizer, tasks }),
        reminderDayViewContributor({ authorizer, reminders }),
        workDayViewContributor({ authorizer, work }),
      ],
    }),
    reminderCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "entered",
      reminders,
    }),
    reminderRecurrenceCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "entered",
      recurrences,
    }),
    taskCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "entered",
      tasks,
    }),
    workCommandRegistration({ authorizer, clock, ids, preferences, work }),
    financeCommandRegistration({ authorizer, clock, finance, ids }),
    listsCommandRegistration({ authorizer, clock, ids, lists }),
    reportCommandRegistration({
      authorizer,
      events,
      finance,
      preferences,
      tasks,
      work,
    }),
    undoCommandRegistration({
      authorizer,
      undoHandlers: [
        eventUndoHandler({ authorizer, clock, events, ids }),
        reminderUndoHandler({ authorizer, clock, ids, reminders }),
        reminderRecurrenceUndoHandler({ authorizer, clock, ids, recurrences }),
        taskUndoHandler({ authorizer, clock, ids, tasks }),
        workUndoHandler({ authorizer, clock, ids, work }),
        financeUndoHandler({ authorizer, clock, finance, ids }),
        listsUndoHandler({ authorizer, clock, ids, lists }),
        preferenceUndoHandler({ authorizer, clock, ids, preferences }),
      ],
    }),
    ai.registration,
  ]);

  return {
    dependencies: {
      clock,
      commands,
      deliveries: repositories.deliveries,
      identities: repositories.identities,
      ids,
      inbox: repositories.inbox,
      reply,
      leaseSeconds: config.INBOX_LEASE_SECONDS,
    },
    repositories,
    aiJob: ai.job,
  };
}
