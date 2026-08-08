import type {
  DeliveryRepository,
  EffectRepository,
  IdentityRepository,
  InboundRepository,
  TelegramReplyPort,
} from "./ports";
import type { InboundMessageEnvelope } from "./queue-envelope";
import { startOnboarding } from "../domains/onboarding/start";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

export interface ProcessInboundDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly deliveries: DeliveryRepository;
  readonly effects: EffectRepository;
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
    message.text?.trim().split(/\s+/u)[0]?.toLowerCase() !== "/start"
  ) {
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
  const result = startOnboarding();
  await dependencies.effects.complete(
    scope,
    effectKey,
    dependencies.clock.now(),
  );

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
    const sent = await dependencies.reply.send(message.chat.id, result.text);
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
