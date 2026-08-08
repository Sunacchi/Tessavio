import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import { renderBoundedFinanceSections } from "../../src/application/manage-finance";
import {
  calculateFinanceTotals,
  financeMaximumAmountMinor,
  validateFinanceDateRange,
  validateFinanceEntry,
} from "../../src/domains/finance/finance";

describe("B5 finance domain", () => {
  it("parses create, correction, delete and range commands", () => {
    expect(
      parseDeterministicCommand(
        "/finanze crea spesa 1299 EUR 2026-08-08 | Alimentari | Mercato | carta | spesa settimanale",
      ),
    ).toEqual({
      kind: "finance.create",
      entryKind: "expense",
      amountMinor: "1299",
      currency: "EUR",
      localDate: "2026-08-08",
      category: " Alimentari ",
      merchant: " Mercato ",
      paymentMethod: " carta ",
      note: " spesa settimanale",
    });
    expect(
      parseDeterministicCommand(
        "/finanze correggi mov-1 2 entrata 250000 EUR 2026-08-01 | Stipendio | - | bonifico | -",
      ),
    ).toMatchObject({
      kind: "finance.update",
      entryId: "mov-1",
      expectedVersion: 2,
      entryKind: "income",
      amountMinor: "250000",
    });
    expect(parseDeterministicCommand("/finanze elimina mov-1 3")).toEqual({
      kind: "finance.delete",
      entryId: "mov-1",
      expectedVersion: 3,
    });
    expect(
      parseDeterministicCommand("/spese totali 2026-08-01 2026-08-31"),
    ).toEqual({
      kind: "finance.totals",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
  });

  it("validates exact integer minor units and bounded manual fields", () => {
    const base = {
      kind: "expense",
      amountMinor: "1299",
      currency: "eur",
      localDate: "2026-08-08",
      category: " Alimentari ",
      merchant: "-",
      paymentMethod: " carta ",
      note: "",
    };
    expect(validateFinanceEntry(base)).toEqual({
      ok: true,
      value: {
        kind: "expense",
        amountMinor: 1299,
        currency: "EUR",
        localDate: "2026-08-08",
        category: "Alimentari",
        merchant: null,
        paymentMethod: "carta",
        note: null,
      },
    });
    for (const amountMinor of [
      "0",
      "-1",
      "12.99",
      "12,99",
      String(financeMaximumAmountMinor + 1),
    ]) {
      expect(validateFinanceEntry({ ...base, amountMinor })).toEqual({
        ok: false,
        issue: "amount",
      });
    }
    expect(validateFinanceEntry({ ...base, localDate: "2026-02-30" })).toEqual({
      ok: false,
      issue: "date",
    });
    expect(validateFinanceEntry({ ...base, note: "x".repeat(501) })).toEqual({
      ok: false,
      issue: "note",
    });
  });

  it("bounds inclusive civil-date ranges", () => {
    expect(
      validateFinanceDateRange({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      }),
    ).toMatchObject({ ok: true, value: { civilDayCount: 366 } });
    expect(
      validateFinanceDateRange({
        startDate: "2024-01-01",
        endDate: "2025-01-01",
      }),
    ).toEqual({ ok: false, issue: "range_duration" });
  });

  it("keeps long finance replies within the Telegram-safe budget", () => {
    const rendered = renderBoundedFinanceSections(
      "Movimenti:",
      Array.from(
        { length: 50 },
        (_, index) => `${String(index)} ${"x".repeat(500)}`,
      ),
    );
    expect(rendered.length).toBeLessThanOrEqual(3_500);
    expect(rendered).toContain("sezioni non mostrate");
  });

  it("preserves exact per-currency totals for generated integer movements", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom("expense" as const, "income" as const),
            amountMinor: fc.integer({ min: 1, max: financeMaximumAmountMinor }),
            currency: fc.constantFrom("EUR", "USD", "JPY"),
          }),
          { minLength: 1, maxLength: 200 },
        ),
        (entries) => {
          const totals = calculateFinanceTotals(entries);
          for (const total of totals) {
            const matching = entries.filter(
              (entry) => entry.currency === total.currency,
            );
            const expectedIncome = matching
              .filter((entry) => entry.kind === "income")
              .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
            const expectedExpense = matching
              .filter((entry) => entry.kind === "expense")
              .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
            expect(total.incomeMinor).toBe(expectedIncome);
            expect(total.expenseMinor).toBe(expectedExpense);
            expect(total.netMinor).toBe(expectedIncome - expectedExpense);
            expect(total.entryCount).toBe(matching.length);
          }
        },
      ),
    );
  });
});
