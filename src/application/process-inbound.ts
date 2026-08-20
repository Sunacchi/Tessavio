import type { DeliveryRepository } from "./ports/delivery";
import type { IdentityRepository } from "./ports/identity";
import type { InboundRepository } from "./ports/inbound";
import type { TelegramReplyPort } from "./ports/telegram";
import type { InboundMessageEnvelope } from "./queue-envelope";
import { parseDeterministicCommand } from "./deterministic-command";
import type { CommandRegistry, CommandReply } from "./handler-registry";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

export interface ProcessInboundDependencies {
  readonly clock: Clock;
  readonly commands: CommandRegistry;
  readonly deliveries: DeliveryRepository;
  readonly identities: IdentityRepository;
  readonly ids: IdGenerator;
  readonly inbox: InboundRepository;
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
  const replyText: CommandReply = await dependencies.commands.handle(command, {
    actorUserId: identity.userId,
    scope,
    correlationId: envelope.correlationId,
    idempotencyKey: envelope.idempotencyKey,
    jobId: envelope.jobId,
    sentAtUnix: message.sentAtUnix,
  });

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
    let sent: { readonly messageId: string };
    if (typeof replyText === "string") {
      sent = await dependencies.reply.send(message.chat.id, replyText);
    } else {
      if (dependencies.reply.sendDocument === undefined) {
        throw new AppError("INTERNAL_REDACTED", false);
      }
      sent = await dependencies.reply.sendDocument(message.chat.id, replyText);
    }
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
