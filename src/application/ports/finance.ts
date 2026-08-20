import type {
  FinanceCurrencyTotal,
  FinanceDateRange,
  FinanceEntryRecord,
  FinanceEntryValues,
} from "../../domains/finance/finance";
import type { UserScope } from "../../shared/contracts";

export interface FinanceMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateFinanceResult =
  | {
      readonly outcome: "created" | "updated" | "deleted" | "duplicate";
      readonly entry: FinanceEntryRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | { readonly outcome: "not_found" | "stale" };

export type UndoFinanceResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly entry: FinanceEntryRecord | null;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface FinanceRepository {
  get(scope: UserScope, entryId: string): Promise<FinanceEntryRecord | null>;
  list(
    scope: UserScope,
    range: FinanceDateRange,
    limit: number,
  ): Promise<FinanceEntryRecord[]>;
  listForReport(
    scope: UserScope,
    range: FinanceDateRange,
    limit: number,
  ): Promise<FinanceEntryRecord[]>;
  totals(
    scope: UserScope,
    range: FinanceDateRange,
  ): Promise<FinanceCurrencyTotal[]>;
  create(
    scope: UserScope,
    entryId: string,
    values: FinanceEntryValues,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult>;
  update(
    scope: UserScope,
    entryId: string,
    expectedVersion: number,
    values: FinanceEntryValues,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult>;
  delete(
    scope: UserScope,
    entryId: string,
    expectedVersion: number,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<FinanceMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoFinanceResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}
