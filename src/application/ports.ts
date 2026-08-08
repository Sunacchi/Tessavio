import type { InboundMessageEnvelope } from "./queue-envelope";
import type { UserScope } from "../shared/contracts";

export interface RegisteredInbound {
  readonly duplicate: boolean;
  readonly envelope: InboundMessageEnvelope;
  readonly status: string;
}

export interface InboundRepository {
  register(
    envelope: InboundMessageEnvelope,
    now: Date,
  ): Promise<RegisteredInbound>;
  markEnqueued(jobId: string, now: Date): Promise<void>;
  claim(
    envelope: InboundMessageEnvelope,
    now: Date,
    leaseSeconds: number,
  ): Promise<"claimed" | "completed" | "busy" | "missing">;
  complete(jobId: string, now: Date, ambiguous: boolean): Promise<void>;
  fail(
    jobId: string,
    now: Date,
    errorCode: string,
    terminal: boolean,
  ): Promise<void>;
  listPendingEnqueue(
    before: Date,
    limit: number,
  ): Promise<InboundMessageEnvelope[]>;
}

export interface IdentityResolution {
  readonly userId: string;
  readonly created: boolean;
}

export interface IdentityRepository {
  resolveOrCreate(
    telegramUserId: string,
    candidateUserId: string,
    auditId: string,
    correlationId: string,
    now: Date,
  ): Promise<IdentityResolution>;
}

export type EffectStatus = "claimed" | "completed";

export interface EffectRepository {
  claim(
    scope: UserScope,
    effectKey: string,
    jobId: string,
    now: Date,
  ): Promise<boolean>;
  complete(scope: UserScope, effectKey: string, now: Date): Promise<void>;
  get(scope: UserScope, effectKey: string): Promise<EffectStatus | null>;
}

export type DeliveryStatus =
  "pending" | "sending" | "sent" | "ambiguous" | "permanent_failure";

export interface DeliveryRepository {
  prepare(
    scope: UserScope,
    deliveryKey: string,
    jobId: string,
    now: Date,
  ): Promise<DeliveryStatus>;
  begin(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<"send" | "skip" | "ambiguous">;
  markSent(
    scope: UserScope,
    deliveryKey: string,
    remoteMessageId: string,
    now: Date,
  ): Promise<void>;
  markAmbiguous(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void>;
  markPermanentFailure(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void>;
}

export interface TelegramReplyPort {
  send(chatId: number, text: string): Promise<{ readonly messageId: string }>;
}
