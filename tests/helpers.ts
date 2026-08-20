import type { DayViewContributor } from "../src/application/day-view";
import {
  createCommandRegistry,
  type CommandRegistration,
} from "../src/application/handler-registry";
import {
  eventCommandRegistration,
  eventUndoHandler,
} from "../src/application/manage-events";
import {
  financeCommandRegistration,
  financeUndoHandler,
} from "../src/application/manage-finance";
import {
  listsCommandRegistration,
  listsUndoHandler,
} from "../src/application/manage-lists";
import { onboardingCommandRegistration } from "../src/application/manage-onboarding";
import {
  preferenceCommandRegistration,
  preferenceUndoHandler,
} from "../src/application/manage-preferences";
import {
  reminderRecurrenceCommandRegistration,
  reminderRecurrenceUndoHandler,
} from "../src/application/manage-reminder-recurrences";
import {
  reminderCommandRegistration,
  reminderDayViewContributor,
  reminderUndoHandler,
} from "../src/application/manage-reminders";
import { reportCommandRegistration } from "../src/application/manage-reports";
import {
  taskCommandRegistration,
  taskDayViewContributor,
  taskUndoHandler,
} from "../src/application/manage-tasks";
import { undoCommandRegistration } from "../src/application/manage-undo";
import {
  workCommandRegistration,
  workDayViewContributor,
  workUndoHandler,
} from "../src/application/manage-work";
import type { DeliveryRepository } from "../src/application/ports/delivery";
import type { EffectRepository } from "../src/application/ports/effects";
import type { EventRepository } from "../src/application/ports/events";
import type { FinanceRepository } from "../src/application/ports/finance";
import type { IdentityRepository } from "../src/application/ports/identity";
import type { InboundRepository } from "../src/application/ports/inbound";
import type { ListRepository } from "../src/application/ports/lists";
import type { PreferenceRepository } from "../src/application/ports/preferences";
import type { ReminderRecurrenceRepository } from "../src/application/ports/recurrences";
import type { ReminderRepository } from "../src/application/ports/reminders";
import type { TaskRepository } from "../src/application/ports/tasks";
import type { TelegramReplyPort } from "../src/application/ports/telegram";
import type { WorkRepository } from "../src/application/ports/work";
import type { ProcessInboundDependencies } from "../src/application/process-inbound";
import type { UndoHandler } from "../src/application/undo-registry";
import type { Authorizer } from "../src/security/authorization";
import type { AppConfig } from "../src/shared/config";
import type { Clock, IdGenerator } from "../src/shared/contracts";

/**
 * Le dipendenze che un test può fornire. Le slice opzionali qui sono
 * volutamente opzionali: servono a provare un registry parziale.
 */
export interface TestRuntimeParts {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly deliveries: DeliveryRepository;
  readonly identities: IdentityRepository;
  readonly ids: IdGenerator;
  readonly inbox: InboundRepository;
  readonly preferences: PreferenceRepository;
  readonly reply: TelegramReplyPort;
  readonly leaseSeconds: number;
  readonly effects?: EffectRepository;
  readonly events?: EventRepository;
  readonly finance?: FinanceRepository;
  readonly lists?: ListRepository;
  readonly recurrences?: ReminderRecurrenceRepository;
  readonly reminders?: ReminderRepository;
  readonly tasks?: TaskRepository;
  readonly work?: WorkRepository;
}

export const testConfig: AppConfig = {
  APP_ENV: "development",
  TELEGRAM_API_BASE_URL: "https://api.telegram.org",
  WEBHOOK_PATH: "/telegram/webhook",
  WEBHOOK_MAX_BODY_BYTES: 65_536,
  WEBHOOK_RATE_LIMIT_MAX: 120,
  WEBHOOK_RATE_WINDOW_SECONDS: 60,
  WEBHOOK_MAX_CONCURRENCY: 16,
  WEBHOOK_LEASE_SECONDS: 30,
  INBOX_LEASE_SECONDS: 60,
  INBOX_RECOVERY_AFTER_SECONDS: 30,
  REMINDER_LEASE_SECONDS: 600,
  REMINDER_ENQUEUE_RECOVERY_SECONDS: 30,
  REMINDER_RETRY_DELAY_SECONDS: 60,
  REMINDER_CLAIM_LIMIT: 100,
  REMINDER_MAX_DELIVERY_ATTEMPTS: 6,
};

export class FakeClock implements Clock {
  constructor(private current: Date = new Date("2026-08-08T08:00:00.000Z")) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export class SequenceIds implements IdGenerator {
  private next = 1;

  newId(): string {
    const suffix = String(this.next).padStart(12, "0");
    this.next += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  }
}

export function telegramStartUpdate(
  updateId = 101,
  telegramUserId = 2001,
): object {
  return telegramTextUpdate("/start", updateId, telegramUserId);
}

export function telegramTextUpdate(
  text: string,
  updateId = 101,
  telegramUserId = 2001,
): object {
  return {
    update_id: updateId,
    message: {
      message_id: 10,
      date: 1_786_173_600,
      from: {
        id: telegramUserId,
        is_bot: false,
        first_name: "Private fixture that must be discarded",
        username: "never_persist_this",
      },
      chat: { id: telegramUserId, type: "private" },
      text,
    },
  };
}

export function webhookRequest(
  body: object | string,
  secret = "test-webhook-secret",
  sourceIp = "192.0.2.10",
): Request {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://example.test/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": sourceIp,
      "x-telegram-bot-api-secret-token": secret,
    },
    body: payload,
  });
}

/**
 * Compone il registry dei comandi per un test registrando **soltanto** le
 * slice di cui il test fornisce il repository: una slice assente non è
 * registrata e il registry risponde che non è disponibile.
 */
export function testInboundDependencies(
  parts: TestRuntimeParts,
): ProcessInboundDependencies {
  const { authorizer, clock, ids, preferences } = parts;
  const registrations: CommandRegistration[] = [
    preferenceCommandRegistration({ authorizer, clock, ids, preferences }),
  ];
  const undoHandlers: UndoHandler[] = [];
  const dayViewContributors: DayViewContributor[] = [];

  if (parts.effects !== undefined) {
    registrations.push(
      onboardingCommandRegistration({
        authorizer,
        clock,
        effects: parts.effects,
      }),
    );
  }
  if (parts.tasks !== undefined) {
    const tasks = parts.tasks;
    registrations.push(
      taskCommandRegistration({ authorizer, clock, ids, preferences, tasks }),
    );
    dayViewContributors.push(taskDayViewContributor({ authorizer, tasks }));
    undoHandlers.push(taskUndoHandler({ authorizer, clock, ids, tasks }));
  }
  if (parts.reminders !== undefined) {
    const reminders = parts.reminders;
    registrations.push(
      reminderCommandRegistration({
        authorizer,
        clock,
        ids,
        preferences,
        reminders,
      }),
    );
    dayViewContributors.push(
      reminderDayViewContributor({ authorizer, reminders }),
    );
    undoHandlers.push(
      reminderUndoHandler({ authorizer, clock, ids, reminders }),
    );
  }
  if (parts.work !== undefined) {
    const work = parts.work;
    registrations.push(
      workCommandRegistration({ authorizer, clock, ids, preferences, work }),
    );
    dayViewContributors.push(workDayViewContributor({ authorizer, work }));
    undoHandlers.push(workUndoHandler({ authorizer, clock, ids, work }));
  }
  if (parts.recurrences !== undefined) {
    const recurrences = parts.recurrences;
    registrations.push(
      reminderRecurrenceCommandRegistration({
        authorizer,
        clock,
        ids,
        preferences,
        recurrences,
      }),
    );
    undoHandlers.push(
      reminderRecurrenceUndoHandler({ authorizer, clock, ids, recurrences }),
    );
  }
  if (parts.finance !== undefined) {
    const finance = parts.finance;
    registrations.push(
      financeCommandRegistration({ authorizer, clock, finance, ids }),
    );
    undoHandlers.push(financeUndoHandler({ authorizer, clock, finance, ids }));
  }
  if (parts.lists !== undefined) {
    const lists = parts.lists;
    registrations.push(
      listsCommandRegistration({ authorizer, clock, ids, lists }),
    );
    undoHandlers.push(listsUndoHandler({ authorizer, clock, ids, lists }));
  }
  if (parts.events !== undefined) {
    const events = parts.events;
    registrations.push(
      eventCommandRegistration({
        authorizer,
        clock,
        events,
        ids,
        preferences,
        dayViewContributors,
      }),
    );
    undoHandlers.push(eventUndoHandler({ authorizer, clock, events, ids }));
  }
  if (
    parts.events !== undefined &&
    parts.finance !== undefined &&
    parts.tasks !== undefined &&
    parts.work !== undefined
  ) {
    registrations.push(
      reportCommandRegistration({
        authorizer,
        events: parts.events,
        finance: parts.finance,
        preferences,
        tasks: parts.tasks,
        work: parts.work,
      }),
    );
  }
  undoHandlers.push(
    preferenceUndoHandler({ authorizer, clock, ids, preferences }),
  );
  registrations.push(undoCommandRegistration({ authorizer, undoHandlers }));

  return {
    clock,
    commands: createCommandRegistry(registrations),
    deliveries: parts.deliveries,
    identities: parts.identities,
    ids,
    inbox: parts.inbox,
    reply: parts.reply,
    leaseSeconds: parts.leaseSeconds,
  };
}
