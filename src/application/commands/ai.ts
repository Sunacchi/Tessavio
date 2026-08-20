import {
  commandKindGuard,
  commandParts,
  opaqueTokenPattern,
  type CommandRoute,
} from "./shared";

export type AiCommand =
  | { readonly kind: "ai.status" }
  | { readonly kind: "ai.propose"; readonly text: string }
  | { readonly kind: "ai.confirm"; readonly token: string }
  | { readonly kind: "ai.link" }
  | { readonly kind: "ai.unlink" }
  | { readonly kind: "ai.invalid" };

export function parseAiCommand(text: string): AiCommand {
  const parts = commandParts(text);
  if (parts.length === 1) return { kind: "ai.status" };

  const operation = parts[1]?.toLowerCase();
  if (operation === "collega") {
    return parts.length === 2 ? { kind: "ai.link" } : { kind: "ai.invalid" };
  }
  if (operation === "scollega") {
    return parts.length === 2 ? { kind: "ai.unlink" } : { kind: "ai.invalid" };
  }
  if (operation === "conferma") {
    const token = parts[2];
    if (
      parts.length === 3 &&
      token !== undefined &&
      opaqueTokenPattern.test(token)
    ) {
      return { kind: "ai.confirm", token };
    }
    return { kind: "ai.invalid" };
  }
  if (operation === "proponi") {
    const request = text
      .slice(text.toLowerCase().indexOf("proponi") + 7)
      .trim();
    return request.length === 0
      ? { kind: "ai.invalid" }
      : { kind: "ai.propose", text: request };
  }
  return { kind: "ai.invalid" };
}

export const aiCommandKinds = [
  "ai.status",
  "ai.propose",
  "ai.confirm",
  "ai.link",
  "ai.unlink",
  "ai.invalid",
] as const;

export const isAiCommand = commandKindGuard<AiCommand>(aiCommandKinds);

export const aiCommandRoutes: readonly CommandRoute<AiCommand>[] = [
  ["/ai", parseAiCommand],
];
