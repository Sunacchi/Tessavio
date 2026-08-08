import type { InboundMessageEnvelope } from "./queue-envelope";
import type {
  PreferenceProfile,
  PreferenceValues,
} from "../domains/preferences/preferences";
import type {
  EventDayWindow,
  EventRecord,
  EventValues,
} from "../domains/events/events";
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
  markRetryableFailure(
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

export interface PreferenceMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export interface SetPreferencesResult {
  readonly outcome: "created" | "updated" | "duplicate";
  readonly profile: PreferenceProfile;
  readonly undoToken: string | null;
  readonly undoExpiresAt: Date | null;
}

export type UndoPreferencesResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly profile: PreferenceProfile | null;
    }
  | {
      readonly outcome: "not_found" | "expired" | "used" | "stale";
    };

export interface PreferenceRepository {
  get(scope: UserScope): Promise<PreferenceProfile | null>;
  set(
    scope: UserScope,
    values: PreferenceValues,
    context: PreferenceMutationContext,
  ): Promise<SetPreferencesResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<PreferenceMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoPreferencesResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}

export interface EventMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateEventResult =
  | {
      readonly outcome: "created" | "updated" | "cancelled" | "duplicate";
      readonly event: EventRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | { readonly outcome: "not_found" | "already_cancelled" };

export type UndoEventResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly event: EventRecord | null;
    }
  | {
      readonly outcome: "not_found" | "expired" | "used" | "stale";
    };

export interface EventRepository {
  get(scope: UserScope, eventId: string): Promise<EventRecord | null>;
  listForDay(scope: UserScope, window: EventDayWindow): Promise<EventRecord[]>;
  create(
    scope: UserScope,
    eventId: string,
    values: EventValues,
    context: EventMutationContext,
  ): Promise<MutateEventResult>;
  update(
    scope: UserScope,
    eventId: string,
    values: EventValues,
    context: EventMutationContext,
  ): Promise<MutateEventResult>;
  cancel(
    scope: UserScope,
    eventId: string,
    context: EventMutationContext,
  ): Promise<MutateEventResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<EventMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoEventResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}
