import { commandParts, type CommandRoute } from "./shared";

export type PreferenceCommand =
  | { readonly kind: "preferences.read" }
  | {
      readonly kind: "preferences.set";
      readonly language: string;
      readonly timeZone: string;
      readonly hourFormat: string;
      readonly defaultCurrency: string;
    }
  | { readonly kind: "preferences.undo"; readonly token: string }
  | {
      readonly kind: "preferences.quiet_hours.set";
      readonly start: string;
      readonly end: string;
    }
  | { readonly kind: "preferences.quiet_hours.disable" }
  | { readonly kind: "preferences.invalid" };

export function parsePreferenceCommand(text: string): PreferenceCommand {
  const parts = commandParts(text);
  if (parts.length === 1) {
    return { kind: "preferences.read" };
  }
  if (parts[1]?.toLowerCase() === "imposta" && parts.length === 6) {
    return {
      kind: "preferences.set",
      language: parts[2] ?? "",
      timeZone: parts[3] ?? "",
      hourFormat: parts[4] ?? "",
      defaultCurrency: parts[5] ?? "",
    };
  }
  if (parts[1]?.toLowerCase() === "quiete") {
    if (parts[2]?.toLowerCase() === "disattiva" && parts.length === 3) {
      return { kind: "preferences.quiet_hours.disable" };
    }
    if (parts.length === 4) {
      return {
        kind: "preferences.quiet_hours.set",
        start: parts[2] ?? "",
        end: parts[3] ?? "",
      };
    }
  }
  return { kind: "preferences.invalid" };
}

export const preferenceCommandRoutes: readonly CommandRoute<PreferenceCommand>[] =
  [["/impostazioni", parsePreferenceCommand]];
