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
  reminderCommandRegistration,
  reminderDayViewContributor,
  reminderUndoHandler,
} from "../application/manage-reminders";
import {
  reminderRecurrenceCommandRegistration,
  reminderRecurrenceUndoHandler,
} from "../application/manage-reminder-recurrences";
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
import type { ProcessInboundDependencies } from "../application/process-inbound";
import { D1DeliveryRepository } from "../infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../infrastructure/db/effect-repository";
import { D1EventRepository } from "../infrastructure/db/event-repository";
import { D1FinanceRepository } from "../infrastructure/db/finance-repository";
import { D1IdentityRepository } from "../infrastructure/db/identity-repository";
import { D1InboundRepository } from "../infrastructure/db/inbound-repository";
import { D1ListRepository } from "../infrastructure/db/list-repository";
import { D1PreferenceRepository } from "../infrastructure/db/preference-repository";
import { D1ReminderRecurrenceRepository } from "../infrastructure/db/reminder-recurrence-repository";
import { D1ReminderRepository } from "../infrastructure/db/reminder-repository";
import { D1TaskRepository } from "../infrastructure/db/task-repository";
import { D1WorkRepository } from "../infrastructure/db/work-repository";
import { SelfScopeAuthorizer } from "../security/authorization";
import type { AppConfig } from "../shared/config";
import type { Clock, IdGenerator } from "../shared/contracts";

export interface InboundRuntime {
  readonly dependencies: ProcessInboundDependencies;
  readonly inbox: D1InboundRepository;
  readonly identities: D1IdentityRepository;
  readonly preferences: D1PreferenceRepository;
  readonly reminders: D1ReminderRepository;
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
  const effects = new D1EffectRepository(env.DB);
  const events = new D1EventRepository(env.DB);
  const finance = new D1FinanceRepository(env.DB);
  const identities = new D1IdentityRepository(env.DB);
  const inbox = new D1InboundRepository(env.DB);
  const lists = new D1ListRepository(env.DB);
  const preferences = new D1PreferenceRepository(env.DB);
  const recurrences = new D1ReminderRecurrenceRepository(env.DB);
  const reminders = new D1ReminderRepository(env.DB);
  const tasks = new D1TaskRepository(env.DB);
  const work = new D1WorkRepository(env.DB);

  const commands = createCommandRegistry([
    onboardingCommandRegistration({ authorizer, clock, effects }),
    preferenceCommandRegistration({ authorizer, clock, ids, preferences }),
    eventCommandRegistration({
      authorizer,
      clock,
      events,
      ids,
      preferences,
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
      reminders,
    }),
    reminderRecurrenceCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      recurrences,
    }),
    taskCommandRegistration({ authorizer, clock, ids, preferences, tasks }),
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
  ]);

  return {
    dependencies: {
      clock,
      commands,
      deliveries: new D1DeliveryRepository(env.DB),
      identities,
      ids,
      inbox,
      reply,
      leaseSeconds: config.INBOX_LEASE_SECONDS,
    },
    inbox,
    identities,
    preferences,
    reminders,
  };
}
