import { describe, expect, it } from "vitest";
import { resolveMoneySlot } from "../../src/domains/ai/money-slot";

const context = { defaultCurrency: "EUR" };

describe("C1.2 risoluzione deterministica del denaro", () => {
  it("converte le forme italiane in unità minori intere", () => {
    expect(resolveMoneySlot("12,50 euro", context)).toEqual({
      ok: true,
      value: {
        amountMinor: "1250",
        currency: "EUR",
        currencyFromDefault: false,
      },
    });
    expect(resolveMoneySlot("1.234,56 euro", context)).toMatchObject({
      ok: true,
      value: { amountMinor: "123456" },
    });
    expect(resolveMoneySlot("8 euro", context)).toMatchObject({
      ok: true,
      value: { amountMinor: "800" },
    });
    expect(resolveMoneySlot("12,5 euro", context)).toMatchObject({
      ok: true,
      value: { amountMinor: "1250" },
    });
  });

  it("accetta anche la notazione inglese e i simboli", () => {
    expect(resolveMoneySlot("$1,234.56", context)).toEqual({
      ok: true,
      value: {
        amountMinor: "123456",
        currency: "USD",
        currencyFromDefault: false,
      },
    });
    expect(resolveMoneySlot("£20", context)).toMatchObject({
      ok: true,
      value: { currency: "GBP" },
    });
  });

  it("usa la valuta predefinita e lo dichiara", () => {
    expect(resolveMoneySlot("15,00", context)).toEqual({
      ok: true,
      value: {
        amountMinor: "1500",
        currency: "EUR",
        currencyFromDefault: true,
      },
    });
  });

  it("non inventa un importo quando il testo non ne contiene", () => {
    expect(resolveMoneySlot("un sacco di soldi", context)).toEqual({
      ok: false,
      issue: "unparsable",
    });
    expect(resolveMoneySlot("", context)).toEqual({
      ok: false,
      issue: "unparsable",
    });
  });

  it("rifiuta importi fuori scala invece di troncarli", () => {
    expect(resolveMoneySlot("99999999999 euro", context)).toEqual({
      ok: false,
      issue: "out_of_range",
    });
    expect(resolveMoneySlot("0 euro", context)).toEqual({
      ok: false,
      issue: "out_of_range",
    });
  });

  it("non produce mai un valore in virgola mobile", () => {
    const result = resolveMoneySlot("0,07 euro", context);
    expect(result).toMatchObject({ ok: true, value: { amountMinor: "7" } });
    if (result.ok) {
      expect(Number.isInteger(Number(result.value.amountMinor))).toBe(true);
    }
  });
});
