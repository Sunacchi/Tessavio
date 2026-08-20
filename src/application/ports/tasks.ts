import type {
  TaskDayWindow,
  TaskRangeWindow,
  TaskRecord,
  TaskValues,
} from "../../domains/tasks/tasks";
import type { EntityProvenance, UserScope } from "../../shared/contracts";

export interface TaskMutationContext {
  readonly actorUserId: string;
  readonly provenance: EntityProvenance;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateTaskResult =
  | {
      readonly outcome: "created" | "completed" | "reopened" | "duplicate";
      readonly task: TaskRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | { readonly outcome: "not_found" | "already_completed" | "already_open" };

export type UndoTaskResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly task: TaskRecord | null;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface TaskRepository {
  get(scope: UserScope, taskId: string): Promise<TaskRecord | null>;
  listOpen(scope: UserScope, limit: number): Promise<TaskRecord[]>;
  listForDay(
    scope: UserScope,
    window: TaskDayWindow,
    limit?: number,
  ): Promise<TaskRecord[]>;
  listForRange(
    scope: UserScope,
    window: TaskRangeWindow,
    limit: number,
  ): Promise<TaskRecord[]>;
  create(
    scope: UserScope,
    taskId: string,
    values: TaskValues,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult>;
  complete(
    scope: UserScope,
    taskId: string,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult>;
  reopen(
    scope: UserScope,
    taskId: string,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<
      TaskMutationContext,
      "undoToken" | "undoExpiresAt" | "provenance"
    >,
  ): Promise<UndoTaskResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}
