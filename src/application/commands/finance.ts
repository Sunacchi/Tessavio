import {
  commandKindGuard,
  commandParts,
  entityIdPattern,
  parsePositiveVersion,
  type CommandRoute,
} from "./shared";

interface FinanceDraftCommand {
  readonly entryKind: string;
  readonly amountMinor: string;
  readonly currency: string;
  readonly localDate: string;
  readonly category: string;
  readonly merchant: string;
  readonly paymentMethod: string;
  readonly note: string;
}

export type FinanceCommand =
  | ({ readonly kind: "finance.create" } & FinanceDraftCommand)
  | ({
      readonly kind: "finance.update";
      readonly entryId: string;
      readonly expectedVersion: number;
    } & FinanceDraftCommand)
  | { readonly kind: "finance.read"; readonly entryId: string }
  | {
      readonly kind: "finance.list";
      readonly startDate: string;
      readonly endDate: string;
    }
  | {
      readonly kind: "finance.totals";
      readonly startDate: string;
      readonly endDate: string;
    }
  | {
      readonly kind: "finance.delete";
      readonly entryId: string;
      readonly expectedVersion: number;
    }
  | { readonly kind: "finance.invalid" };

function financeKind(value: string | undefined): string {
  switch (value?.toLowerCase()) {
    case "spesa":
      return "expense";
    case "entrata":
      return "income";
    default:
      return value ?? "";
  }
}

function parseFinanceFields(text: string): {
  readonly commandText: string;
  readonly fields: readonly [string, string, string, string];
} | null {
  const sections = text.split("|");
  if (sections.length < 2 || sections.length > 5) return null;
  const optional = sections.slice(1);
  return {
    commandText: sections[0]?.trim() ?? "",
    fields: [
      optional[0] ?? "",
      optional[1] ?? "",
      optional[2] ?? "",
      optional[3] ?? "",
    ],
  };
}

export function parseFinanceCommand(text: string): FinanceCommand {
  const parsedFields = parseFinanceFields(text);
  if (parsedFields !== null) {
    const parts = commandParts(parsedFields.commandText);
    const operation = parts[1]?.toLowerCase();
    const [category, merchant, paymentMethod, note] = parsedFields.fields;
    if (operation === "crea" && parts.length === 6) {
      return {
        kind: "finance.create",
        entryKind: financeKind(parts[2]),
        amountMinor: parts[3] ?? "",
        currency: parts[4] ?? "",
        localDate: parts[5] ?? "",
        category,
        merchant,
        paymentMethod,
        note,
      };
    }
    const expectedVersion = parsePositiveVersion(parts[3]);
    if (
      operation === "correggi" &&
      parts.length === 8 &&
      entityIdPattern.test(parts[2] ?? "") &&
      expectedVersion !== null
    ) {
      return {
        kind: "finance.update",
        entryId: parts[2] ?? "",
        expectedVersion,
        entryKind: financeKind(parts[4]),
        amountMinor: parts[5] ?? "",
        currency: parts[6] ?? "",
        localDate: parts[7] ?? "",
        category,
        merchant,
        paymentMethod,
        note,
      };
    }
    return { kind: "finance.invalid" };
  }

  const parts = commandParts(text);
  const operation = parts[1]?.toLowerCase();
  if (
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "finance.read", entryId: parts[2] ?? "" };
  }
  if ((operation === "lista" || operation === "totali") && parts.length === 4) {
    return {
      kind: operation === "lista" ? "finance.list" : "finance.totals",
      startDate: parts[2] ?? "",
      endDate: parts[3] ?? "",
    };
  }
  const expectedVersion = parsePositiveVersion(parts[3]);
  if (
    operation === "elimina" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[2] ?? "") &&
    expectedVersion !== null
  ) {
    return {
      kind: "finance.delete",
      entryId: parts[2] ?? "",
      expectedVersion,
    };
  }
  return { kind: "finance.invalid" };
}

export const financeCommandRoutes: readonly CommandRoute<FinanceCommand>[] = [
  ["/finanze", parseFinanceCommand],
  ["/spese", parseFinanceCommand],
];

export const financeCommandKinds = [
  "finance.create",
  "finance.update",
  "finance.read",
  "finance.list",
  "finance.totals",
  "finance.delete",
  "finance.invalid",
] as const;

export const isFinanceCommand =
  commandKindGuard<FinanceCommand>(financeCommandKinds);
