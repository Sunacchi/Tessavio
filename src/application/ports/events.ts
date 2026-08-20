import type {
  EventDayWindow,
  EventRangeWindow,
  EventRecord,
  EventValues,
} from "../../domains/events/events";
import type { UserScope } from "../../shared/contracts";

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
  listForDay(
    scope: UserScope,
    window: EventDayWindow,
    limit?: number,
  ): Promise<EventRecord[]>;
  listForRange(
    scope: UserScope,
    window: EventRangeWindow,
    limit: number,
  ): Promise<EventRecord[]>;
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
