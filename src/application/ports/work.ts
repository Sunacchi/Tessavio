import type {
  PlannedShiftRecord,
  WorkBreakRecord,
  WorkBreakValues,
  WorkDayRecords,
  WorkIntervalValues,
  WorkLogRecord,
  WorkReport,
  WorkReportWindow,
  WorkRuleRecord,
  WorkRuleValues,
  WorkWindow,
} from "../../domains/work/work";
import type { EntityProvenance, UserScope } from "../../shared/contracts";

export interface WorkMutationContext {
  readonly actorUserId: string;
  readonly provenance: EntityProvenance;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type WorkEntityKind = "rule" | "shift" | "log" | "break";

export type MutateWorkResult<T> =
  | {
      readonly outcome: "created" | "duplicate";
      readonly entity: T;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | {
      readonly outcome:
        | "rule_not_found"
        | "work_log_not_found"
        | "outside_work_log"
        | "overlapping_break";
    };

export type UndoWorkResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly entityKind: WorkEntityKind;
      readonly entityId: string;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface WorkRepository {
  getRule(scope: UserScope, ruleId: string): Promise<WorkRuleRecord | null>;
  listRules(scope: UserScope, limit: number): Promise<WorkRuleRecord[]>;
  getShift(
    scope: UserScope,
    shiftId: string,
  ): Promise<PlannedShiftRecord | null>;
  getLog(scope: UserScope, workLogId: string): Promise<WorkLogRecord | null>;
  getBreak(
    scope: UserScope,
    workBreakId: string,
  ): Promise<WorkBreakRecord | null>;
  listForDay(scope: UserScope, window: WorkWindow): Promise<WorkDayRecords>;
  report(
    scope: UserScope,
    window: WorkReportWindow,
  ): Promise<WorkReport | null>;
  createRule(
    scope: UserScope,
    ruleId: string,
    values: WorkRuleValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkRuleRecord>>;
  createShift(
    scope: UserScope,
    shiftId: string,
    values: WorkIntervalValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<PlannedShiftRecord>>;
  createLog(
    scope: UserScope,
    workLogId: string,
    ruleId: string,
    values: WorkIntervalValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkLogRecord>>;
  createBreak(
    scope: UserScope,
    workBreakId: string,
    workLogId: string,
    values: WorkBreakValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkBreakRecord>>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<
      WorkMutationContext,
      "undoToken" | "undoExpiresAt" | "provenance"
    >,
  ): Promise<UndoWorkResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}
