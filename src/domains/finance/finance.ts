import { Temporal } from "@js-temporal/polyfill";

export const financeUndoTtlMs = 15 * 60 * 1_000;
export const financeListLimit = 50;
export const financeRangeMaxDays = 366;
export const financeMaximumAmountMinor = 2_147_483_647;

export type FinanceEntryKind = "expense" | "income";
export type FinanceEntryStatus = "active" | "deleted";

export interface FinanceEntryRecord {
  readonly id: string;
  readonly kind: FinanceEntryKind;
  readonly amountMinor: number;
  readonly currency: string;
  readonly localDate: string;
  readonly category: string;
  readonly merchant: string | null;
  readonly paymentMethod: string | null;
  readonly note: string | null;
  readonly source: "manual_command";
  readonly status: FinanceEntryStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export type FinanceEntryValues = Pick<
  FinanceEntryRecord,
  | "kind"
  | "amountMinor"
  | "currency"
  | "localDate"
  | "category"
  | "merchant"
  | "paymentMethod"
  | "note"
>;

export interface FinanceDateRange {
  readonly startDate: string;
  readonly endDate: string;
  readonly civilDayCount: number;
}

export interface FinanceCurrencyTotal {
  readonly currency: string;
  readonly expenseMinor: bigint;
  readonly incomeMinor: bigint;
  readonly netMinor: bigint;
  readonly entryCount: number;
}

export type FinanceValidationIssue =
  | "kind"
  | "amount"
  | "currency"
  | "date"
  | "category"
  | "merchant"
  | "payment_method"
  | "note"
  | "range_order"
  | "range_duration";

export type FinanceValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: FinanceValidationIssue };

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const amountPattern = /^\d+$/u;
const currencyPattern = /^[A-Z]{3}$/u;

function containsControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= 31 || point === 127);
  });
}

function requiredText(value: string, maximumLength: number): string | null {
  const cleaned = value.trim();
  return cleaned.length >= 1 &&
    cleaned.length <= maximumLength &&
    !containsControl(cleaned)
    ? cleaned
    : null;
}

function optionalText(
  value: string,
  maximumLength: number,
):
  | { readonly valid: true; readonly value: string | null }
  | {
      readonly valid: false;
    } {
  const cleaned = value.trim();
  if (cleaned === "" || cleaned === "-") {
    return { valid: true, value: null };
  }
  return cleaned.length <= maximumLength && !containsControl(cleaned)
    ? { valid: true, value: cleaned }
    : { valid: false };
}

function parseDate(value: string): Temporal.PlainDate | null {
  if (!localDatePattern.test(value)) return null;
  try {
    const parsed = Temporal.PlainDate.from(value, { overflow: "reject" });
    return parsed.toString() === value ? parsed : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function validateFinanceEntry(input: {
  readonly kind: string;
  readonly amountMinor: string;
  readonly currency: string;
  readonly localDate: string;
  readonly category: string;
  readonly merchant: string;
  readonly paymentMethod: string;
  readonly note: string;
}): FinanceValidationResult<FinanceEntryValues> {
  const kind = input.kind.trim().toLowerCase();
  if (kind !== "expense" && kind !== "income") {
    return { ok: false, issue: "kind" };
  }
  const amountText = input.amountMinor.trim();
  if (!amountPattern.test(amountText)) {
    return { ok: false, issue: "amount" };
  }
  const amountMinor = Number(amountText);
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    amountMinor > financeMaximumAmountMinor
  ) {
    return { ok: false, issue: "amount" };
  }
  const currency = input.currency.trim().toUpperCase();
  if (!currencyPattern.test(currency)) {
    return { ok: false, issue: "currency" };
  }
  const localDate = input.localDate.trim();
  if (parseDate(localDate) === null) {
    return { ok: false, issue: "date" };
  }
  const category = requiredText(input.category, 100);
  if (category === null) return { ok: false, issue: "category" };
  const merchant = optionalText(input.merchant, 200);
  if (!merchant.valid) return { ok: false, issue: "merchant" };
  const paymentMethod = optionalText(input.paymentMethod, 100);
  if (!paymentMethod.valid) {
    return { ok: false, issue: "payment_method" };
  }
  const note = optionalText(input.note, 500);
  if (!note.valid) return { ok: false, issue: "note" };
  return {
    ok: true,
    value: {
      kind,
      amountMinor,
      currency,
      localDate,
      category,
      merchant: merchant.value,
      paymentMethod: paymentMethod.value,
      note: note.value,
    },
  };
}

export function validateFinanceDateRange(input: {
  readonly startDate: string;
  readonly endDate: string;
}): FinanceValidationResult<FinanceDateRange> {
  const start = parseDate(input.startDate.trim());
  const end = parseDate(input.endDate.trim());
  if (start === null || end === null) return { ok: false, issue: "date" };
  const difference = start.until(end, { largestUnit: "day" }).days;
  if (difference < 0) return { ok: false, issue: "range_order" };
  const civilDayCount = difference + 1;
  if (civilDayCount > financeRangeMaxDays) {
    return { ok: false, issue: "range_duration" };
  }
  return {
    ok: true,
    value: {
      startDate: start.toString(),
      endDate: end.toString(),
      civilDayCount,
    },
  };
}

export function calculateFinanceTotals(
  entries: readonly Pick<
    FinanceEntryRecord,
    "kind" | "amountMinor" | "currency"
  >[],
): FinanceCurrencyTotal[] {
  const totals = new Map<
    string,
    { expenseMinor: bigint; incomeMinor: bigint; entryCount: number }
  >();
  for (const entry of entries) {
    const current = totals.get(entry.currency) ?? {
      expenseMinor: 0n,
      incomeMinor: 0n,
      entryCount: 0,
    };
    const amount = BigInt(entry.amountMinor);
    totals.set(entry.currency, {
      expenseMinor:
        current.expenseMinor + (entry.kind === "expense" ? amount : 0n),
      incomeMinor:
        current.incomeMinor + (entry.kind === "income" ? amount : 0n),
      entryCount: current.entryCount + 1,
    });
  }
  return Array.from(totals.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([currency, total]) => ({
      currency,
      ...total,
      netMinor: total.incomeMinor - total.expenseMinor,
    }));
}
