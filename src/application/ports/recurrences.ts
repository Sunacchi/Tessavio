import type { ReminderMutationContext } from "./reminders";
import type {
  ReminderOccurrencePlan,
  ReminderRecurrenceRecord,
  ReminderRecurrenceValues,
} from "../../domains/reminders/recurrence";
import type { UserScope } from "../../shared/contracts";

export type ReminderRecurrenceMutationContext = ReminderMutationContext;

export type MutateReminderRecurrenceResult =
  | {
      readonly outcome: "created" | "cancelled" | "duplicate";
      readonly recurrence: ReminderRecurrenceRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | {
      readonly outcome: "not_found" | "stale" | "not_cancellable";
    };

export type UndoReminderRecurrenceResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly recurrence: ReminderRecurrenceRecord | null;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface DueReminderRecurrenceCandidate {
  readonly scope: UserScope;
  readonly recurrenceId: string;
}

export interface MaterializeReminderOccurrenceContext {
  readonly occurrenceId: string;
  readonly generationKey: string;
  readonly auditId: string;
  readonly correlationId: string;
  readonly now: Date;
}

export interface ReminderRecurrenceRepository {
  get(
    scope: UserScope,
    recurrenceId: string,
  ): Promise<ReminderRecurrenceRecord | null>;
  listActive(
    scope: UserScope,
    limit: number,
  ): Promise<ReminderRecurrenceRecord[]>;
  create(
    scope: UserScope,
    recurrenceId: string,
    values: ReminderRecurrenceValues,
    context: ReminderRecurrenceMutationContext,
  ): Promise<MutateReminderRecurrenceResult>;
  cancel(
    scope: UserScope,
    recurrenceId: string,
    expectedVersion: number,
    context: ReminderRecurrenceMutationContext,
  ): Promise<MutateReminderRecurrenceResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<
      ReminderRecurrenceMutationContext,
      "undoToken" | "undoExpiresAt"
    >,
  ): Promise<UndoReminderRecurrenceResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
  listDueCandidates(
    now: Date,
    limit: number,
  ): Promise<DueReminderRecurrenceCandidate[]>;
  materializeOccurrence(
    scope: UserScope,
    recurrenceId: string,
    expectedVersion: number,
    plan: ReminderOccurrencePlan,
    context: MaterializeReminderOccurrenceContext,
  ): Promise<"generated" | "duplicate" | "stale">;
}
