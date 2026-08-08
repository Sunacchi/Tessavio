import { describe, expect, it } from "vitest";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";
import {
  canonicalizeTimeZone,
  validatePreferenceValues,
} from "../../src/domains/preferences/preferences";

describe("B1.1 preference validation", () => {
  it("accepts complete values and canonicalizes an IANA timezone", () => {
    expect(
      validatePreferenceValues({
        language: "IT",
        timeZone: "Europe/Rome",
        hourFormat: "24H",
        defaultCurrency: "eur",
      }),
    ).toEqual({
      ok: true,
      value: {
        language: "it",
        timeZone: "Europe/Rome",
        hourFormat: "24h",
        defaultCurrency: "EUR",
      },
    });
  });

  it.each(["+02:00", "0200", "Europe/Nowhere", ""])(
    "rejects a non-IANA timezone value: %s",
    (timeZone) => {
      expect(canonicalizeTimeZone(timeZone)).toBeNull();
    },
  );

  it("rejects unsupported language, hour format and currency independently", () => {
    expect(
      validatePreferenceValues({
        language: "fr",
        timeZone: "Europe/Rome",
        hourFormat: "24h",
        defaultCurrency: "EUR",
      }),
    ).toEqual({ ok: false, issue: "language" });
    expect(
      validatePreferenceValues({
        language: "it",
        timeZone: "Europe/Rome",
        hourFormat: "military",
        defaultCurrency: "EUR",
      }),
    ).toEqual({ ok: false, issue: "hour_format" });
    expect(
      validatePreferenceValues({
        language: "it",
        timeZone: "Europe/Rome",
        hourFormat: "24h",
        defaultCurrency: "ZZZ",
      }),
    ).toEqual({ ok: false, issue: "currency" });
  });

  it("accepts every timezone exposed by the runtime without a fixed-offset table", () => {
    for (const timeZone of Intl.supportedValuesOf("timeZone")) {
      expect(canonicalizeTimeZone(timeZone)).not.toBeNull();
    }
  });

  it("parses only complete deterministic preference commands", () => {
    expect(parseDeterministicCommand("/impostazioni")).toEqual({
      kind: "preferences.read",
    });
    expect(
      parseDeterministicCommand("/impostazioni imposta it Europe/Rome 24h EUR"),
    ).toEqual({
      kind: "preferences.set",
      language: "it",
      timeZone: "Europe/Rome",
      hourFormat: "24h",
      defaultCurrency: "EUR",
    });
    expect(parseDeterministicCommand("/impostazioni imposta it")).toEqual({
      kind: "preferences.invalid",
    });
    expect(parseDeterministicCommand("/annulla short")).toEqual({
      kind: "preferences.invalid",
    });
  });
});
