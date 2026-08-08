export type DeterministicCommand =
  | { readonly kind: "start" }
  | { readonly kind: "preferences.read" }
  | {
      readonly kind: "preferences.set";
      readonly language: string;
      readonly timeZone: string;
      readonly hourFormat: string;
      readonly defaultCurrency: string;
    }
  | { readonly kind: "preferences.undo"; readonly token: string }
  | { readonly kind: "preferences.invalid" }
  | { readonly kind: "unsupported" };

const opaqueTokenPattern = /^[A-Za-z0-9_-]{16,128}$/u;

export function parseDeterministicCommand(text: string): DeterministicCommand {
  const parts = text.trim().split(/\s+/u);
  const command = parts[0]?.toLowerCase();

  if (command === "/start" && parts.length === 1) {
    return { kind: "start" };
  }
  if (command === "/impostazioni") {
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
    return { kind: "preferences.invalid" };
  }
  if (command === "/annulla") {
    const token = parts[1];
    if (
      parts.length === 2 &&
      token !== undefined &&
      opaqueTokenPattern.test(token)
    ) {
      return { kind: "preferences.undo", token };
    }
    return { kind: "preferences.invalid" };
  }
  return { kind: "unsupported" };
}
