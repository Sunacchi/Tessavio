import type {
  ReminderDayWindow,
  ReminderRecord,
  ReminderStatus,
} from "../../domains/reminders/reminders";
import type { EntityProvenance, UserScope } from "../../shared/contracts";
import type { SendNotificationEnvelope } from "../queue-envelope";
import type { DeliveryStatus } from "./delivery";

export interface ReminderMutationContext {
  readonly actorUserId: string;
  readonly provenance: EntityProvenance;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateReminderResult =
  | {
      readonly outcome: "created" | "cancelled" | "duplicate";
      readonly reminder: ReminderRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | { readonly outcome: "not_found" | "not_cancellable" };

export type UndoReminderResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly reminder: ReminderRecord | null;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface ClaimedReminder {
  readonly scope: UserScope;
  readonly envelope: SendNotificationEnvelope;
}

export interface ReminderRepository {
  get(scope: UserScope, reminderId: string): Promise<ReminderRecord | null>;
  listPending(scope: UserScope, limit: number): Promise<ReminderRecord[]>;
  listForDay(
    scope: UserScope,
    window: ReminderDayWindow,
    limit: number,
  ): Promise<ReminderRecord[]>;
  create(
    scope: UserScope,
    reminderId: string,
    values: {
      readonly text: string;
      readonly requestedAtUtc: Date;
      readonly originalTimeZone: string;
    },
    context: ReminderMutationContext,
  ): Promise<MutateReminderResult>;
  cancel(
    scope: UserScope,
    reminderId: string,
    context: ReminderMutationContext,
  ): Promise<MutateReminderResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<
      ReminderMutationContext,
      "undoToken" | "undoExpiresAt" | "provenance"
    >,
  ): Promise<UndoReminderResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
  claimDue(
    now: Date,
    leaseSeconds: number,
    limit: number,
    newId: () => string,
  ): Promise<ClaimedReminder[]>;
  listRecoverableClaims(
    now: Date,
    enqueueRecoveryBefore: Date,
    limit: number,
  ): Promise<ClaimedReminder[]>;
  markEnqueued(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<void>;
  getForDelivery(
    scope: UserScope,
    reminderId: string,
    jobId: string,
  ): Promise<ReminderRecord | null>;
  deferForQuietHours(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    dueAt: Date,
    preferenceVersion: number,
    quietStartMinute: number,
    quietEndMinute: number,
    now: Date,
  ): Promise<boolean>;
  markSending(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    preferenceVersion: number,
    quietStartMinute: number | null,
    quietEndMinute: number | null,
    now: Date,
  ): Promise<boolean>;
  markDeliveryOutcome(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    status: Extract<
      ReminderStatus,
      "claimed" | "sent" | "permanent_failure" | "ambiguous"
    >,
    now: Date,
    errorCode?: string,
  ): Promise<void>;
}

export type NotificationDeliveryStatus = DeliveryStatus;

export interface NotificationDeliveryRepository {
  prepare(
    scope: UserScope,
    dedupeKey: string,
    reminderId: string,
    jobId: string,
    now: Date,
  ): Promise<NotificationDeliveryStatus>;
  begin(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<"send" | "skip" | "ambiguous">;
  markSent(
    scope: UserScope,
    dedupeKey: string,
    remoteMessageId: string,
    now: Date,
  ): Promise<void>;
  markRetryableFailure(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<void>;
  markPermanentFailure(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<void>;
  markAmbiguous(scope: UserScope, dedupeKey: string, now: Date): Promise<void>;
  purgeTerminal(scope: UserScope, before: Date, limit: number): Promise<number>;
}
