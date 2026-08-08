import type {
  DeliveryRepository,
  EffectRepository,
  EventRepository,
  FinanceRepository,
  IdentityRepository,
  InboundRepository,
  PreferenceRepository,
  ReminderRepository,
  TaskRepository,
  WorkRepository,
  TelegramReplyPort,
} from "./ports";
import type { InboundMessageEnvelope } from "./queue-envelope";
import { parseDeterministicCommand } from "./deterministic-command";
import { managePreferences } from "./manage-preferences";
import { manageEvents } from "./manage-events";
import { manageUndo } from "./manage-undo";
import { manageReminders } from "./manage-reminders";
import { manageTasks } from "./manage-tasks";
import { manageWork } from "./manage-work";
import { manageFinance } from "./manage-finance";
import { startOnboarding } from "../domains/onboarding/start";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

export interface ProcessInboundDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly deliveries: DeliveryRepository;
  readonly effects: EffectRepository;
  readonly events: EventRepository;
  readonly finance?: FinanceRepository;
  readonly identities: IdentityRepository;
  readonly ids: IdGenerator;
  readonly inbox: InboundRepository;
  readonly preferences: PreferenceRepository;
  readonly reminders: ReminderRepository;
  readonly tasks: TaskRepository;
  readonly work?: WorkRepository;
  readonly reply: TelegramReplyPort;
  readonly leaseSeconds: number;
}

export interface ProcessInboundResult {
  readonly outcome: "completed" | "duplicate" | "unsupported" | "ambiguous";
}

export async function processInboundMessage(
  envelope: InboundMessageEnvelope,
  dependencies: ProcessInboundDependencies,
): Promise<ProcessInboundResult> {
  const claim = await dependencies.inbox.claim(
    envelope,
    dependencies.clock.now(),
    dependencies.leaseSeconds,
  );
  if (claim === "completed") {
    return { outcome: "duplicate" };
  }
  if (claim === "busy") {
    throw new AppError("DUPLICATE", true);
  }
  if (claim === "missing") {
    throw new AppError("INVALID_INPUT", false);
  }

  const message = envelope.payload.message;
  if (
    message === undefined ||
    message.sender.isBot ||
    message.chat.type !== "private" ||
    message.text === undefined
  ) {
    await dependencies.inbox.complete(
      envelope.jobId,
      dependencies.clock.now(),
      false,
    );
    return { outcome: "unsupported" };
  }

  const command = parseDeterministicCommand(message.text);
  if (command.kind === "unsupported") {
    await dependencies.inbox.complete(
      envelope.jobId,
      dependencies.clock.now(),
      false,
    );
    return { outcome: "unsupported" };
  }

  const identity = await dependencies.identities.resolveOrCreate(
    String(message.sender.id),
    dependencies.ids.newId(),
    dependencies.ids.newId(),
    envelope.correlationId,
    dependencies.clock.now(),
  );
  const scope: UserScope = { userId: identity.userId };
  let replyText: string;
  if (command.kind === "start") {
    await dependencies.authorizer.authorize({
      actorUserId: identity.userId,
      scope,
      action: "onboarding:start",
    });

    const effectKey = `onboarding-start:${envelope.jobId}`;
    await dependencies.effects.claim(
      scope,
      effectKey,
      envelope.jobId,
      dependencies.clock.now(),
    );
    replyText = startOnboarding().text;
    await dependencies.effects.complete(
      scope,
      effectKey,
      dependencies.clock.now(),
    );
  } else if (
    command.kind === "preferences.read" ||
    command.kind === "preferences.set" ||
    command.kind === "preferences.undo" ||
    command.kind === "preferences.quiet_hours.set" ||
    command.kind === "preferences.quiet_hours.disable" ||
    command.kind === "preferences.invalid"
  ) {
    replyText = await managePreferences(
      {
        actorUserId: identity.userId,
        scope,
        correlationId: envelope.correlationId,
        idempotencyKey: envelope.idempotencyKey,
        command,
      },
      dependencies,
    );
  } else if (command.kind === "undo" || command.kind === "undo.invalid") {
    replyText = await manageUndo(
      {
        actorUserId: identity.userId,
        scope,
        correlationId: envelope.correlationId,
        idempotencyKey: envelope.idempotencyKey,
        command,
      },
      dependencies,
    );
  } else if (
    command.kind === "reminders.create" ||
    command.kind === "reminders.read" ||
    command.kind === "reminders.list" ||
    command.kind === "reminders.cancel" ||
    command.kind === "reminders.invalid"
  ) {
    replyText = await manageReminders(
      {
        actorUserId: identity.userId,
        scope,
        correlationId: envelope.correlationId,
        idempotencyKey: envelope.idempotencyKey,
        sentAtUnix: message.sentAtUnix,
        command,
      },
      dependencies,
    );
  } else if (
    command.kind === "tasks.create" ||
    command.kind === "tasks.read" ||
    command.kind === "tasks.list" ||
    command.kind === "tasks.complete" ||
    command.kind === "tasks.reopen" ||
    command.kind === "tasks.invalid"
  ) {
    replyText = await manageTasks(
      {
        actorUserId: identity.userId,
        scope,
        correlationId: envelope.correlationId,
        idempotencyKey: envelope.idempotencyKey,
        command,
      },
      dependencies,
    );
  } else if (
    command.kind === "work.rule.create" ||
    command.kind === "work.rule.read" ||
    command.kind === "work.rule.list" ||
    command.kind === "work.shift.create" ||
    command.kind === "work.shift.read" ||
    command.kind === "work.log.create" ||
    command.kind === "work.log.read" ||
    command.kind === "work.break.create" ||
    command.kind === "work.break.read" ||
    command.kind === "work.day" ||
    command.kind === "work.report" ||
    command.kind === "work.invalid"
  ) {
    const work = dependencies.work;
    if (work === undefined) throw new AppError("INTERNAL_REDACTED", false);
    replyText = await manageWork(
      {
        actorUserId: identity.userId,
        scope,
        correlationId: envelope.correlationId,
        idempotencyKey: envelope.idempotencyKey,
        command,
      },
      { ...dependencies, work },
    );
  } else if (
    command.kind === "finance.create" ||
    command.kind === "finance.update" ||
    command.kind === "finance.read" ||
    command.kind === "finance.list" ||
    command.kind === "finance.totals" ||
    command.kind === "finance.delete" ||
    command.kind === "finance.invalid"
  ) {
    const finance = dependencies.finance;
    if (finance === undefined) throw new AppError("INTERNAL_REDACTED", false);
    replyText = await manageFinance(
      {
        actorUserId: identity.userId,
        scope,
        correlationId: envelope.correlationId,
        idempotencyKey: envelope.idempotencyKey,
        command,
      },
      { ...dependencies, finance },
    );
  } else {
    replyText = await manageEvents(
      {
        actorUserId: identity.userId,
        scope,
        correlationId: envelope.correlationId,
        idempotencyKey: envelope.idempotencyKey,
        sentAtUnix: message.sentAtUnix,
        command,
      },
      dependencies,
    );
  }

  const deliveryKey = `telegram-reply:${envelope.jobId}`;
  const currentDelivery = await dependencies.deliveries.prepare(
    scope,
    deliveryKey,
    envelope.jobId,
    dependencies.clock.now(),
  );
  const deliveryAction = await dependencies.deliveries.begin(
    scope,
    deliveryKey,
    dependencies.clock.now(),
  );

  if (deliveryAction === "ambiguous") {
    await dependencies.deliveries.markAmbiguous(
      scope,
      deliveryKey,
      dependencies.clock.now(),
    );
    await dependencies.inbox.complete(
      envelope.jobId,
      dependencies.clock.now(),
      true,
    );
    return { outcome: "ambiguous" };
  }
  if (deliveryAction === "skip") {
    const ambiguous =
      currentDelivery === "ambiguous" || currentDelivery === "sending";
    await dependencies.inbox.complete(
      envelope.jobId,
      dependencies.clock.now(),
      ambiguous,
    );
    return { outcome: ambiguous ? "ambiguous" : "duplicate" };
  }

  try {
    const sent = await dependencies.reply.send(message.chat.id, replyText);
    await dependencies.deliveries.markSent(
      scope,
      deliveryKey,
      sent.messageId,
      dependencies.clock.now(),
    );
    await dependencies.inbox.complete(
      envelope.jobId,
      dependencies.clock.now(),
      false,
    );
    return { outcome: "completed" };
  } catch (error) {
    if (error instanceof AppError && error.code === "PERMANENT_EXTERNAL") {
      await dependencies.deliveries.markPermanentFailure(
        scope,
        deliveryKey,
        dependencies.clock.now(),
      );
      await dependencies.inbox.complete(
        envelope.jobId,
        dependencies.clock.now(),
        false,
      );
      return { outcome: "completed" };
    }
    if (error instanceof AppError && error.code === "RETRYABLE_EXTERNAL") {
      await dependencies.deliveries.markRetryableFailure(
        scope,
        deliveryKey,
        dependencies.clock.now(),
      );
      throw error;
    }

    await dependencies.deliveries.markAmbiguous(
      scope,
      deliveryKey,
      dependencies.clock.now(),
    );
    await dependencies.inbox.complete(
      envelope.jobId,
      dependencies.clock.now(),
      true,
    );
    return { outcome: "ambiguous" };
  }
}
