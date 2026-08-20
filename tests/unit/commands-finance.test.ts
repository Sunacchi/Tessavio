import { describe, expect, it } from "vitest";
import {
  financeCommandRoutes,
  parseFinanceCommand,
} from "../../src/application/commands/finance";

describe("C0.1 finance command parser", () => {
  it("parses create, update and read shapes with optional sections", () => {
    expect(
      parseFinanceCommand("/spese crea spesa 1250 EUR 2026-08-20 | Cibo"),
    ).toEqual({
      kind: "finance.create",
      entryKind: "expense",
      amountMinor: "1250",
      currency: "EUR",
      localDate: "2026-08-20",
      category: " Cibo",
      merchant: "",
      paymentMethod: "",
      note: "",
    });
    expect(parseFinanceCommand("/finanze leggi fin-1")).toEqual({
      kind: "finance.read",
      entryId: "fin-1",
    });
    expect(
      parseFinanceCommand("/finanze totali 2026-08-01 2026-08-31"),
    ).toEqual({
      kind: "finance.totals",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(parseFinanceCommand("/finanze elimina fin-1 0")).toEqual({
      kind: "finance.invalid",
    });
  });

  it("registra /finanze e il suo alias /spese sullo stesso parser", () => {
    expect(financeCommandRoutes.map(([keyword]) => keyword)).toEqual([
      "/finanze",
      "/spese",
    ]);
    expect(financeCommandRoutes[0]?.[1]).toBe(financeCommandRoutes[1]?.[1]);
  });
});
