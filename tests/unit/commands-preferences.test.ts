import { describe, expect, it } from "vitest";
import {
  parsePreferenceCommand,
  preferenceCommandRoutes,
} from "../../src/application/commands/preferences";

describe("C0.1 preference command parser", () => {
  it("parses lettura, impostazione e ore di quiete", () => {
    expect(parsePreferenceCommand("/impostazioni")).toEqual({
      kind: "preferences.read",
    });
    expect(
      parsePreferenceCommand("/impostazioni imposta it Europe/Rome 24h EUR"),
    ).toEqual({
      kind: "preferences.set",
      language: "it",
      timeZone: "Europe/Rome",
      hourFormat: "24h",
      defaultCurrency: "EUR",
    });
    expect(parsePreferenceCommand("/impostazioni quiete 22:00 07:00")).toEqual({
      kind: "preferences.quiet_hours.set",
      start: "22:00",
      end: "07:00",
    });
    expect(parsePreferenceCommand("/impostazioni quiete disattiva")).toEqual({
      kind: "preferences.quiet_hours.disable",
    });
    expect(parsePreferenceCommand("/impostazioni imposta it")).toEqual({
      kind: "preferences.invalid",
    });
  });

  it("registra soltanto /impostazioni", () => {
    expect(preferenceCommandRoutes.map(([keyword]) => keyword)).toEqual([
      "/impostazioni",
    ]);
  });
});
