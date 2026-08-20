import {
  commandKindGuard,
  commandParts,
  entityIdPattern,
  type CommandRoute,
} from "./shared";

export type TaskCommand =
  | {
      readonly kind: "tasks.create";
      readonly due: string;
      readonly priority: string;
      readonly title: string;
    }
  | { readonly kind: "tasks.read"; readonly taskId: string }
  | { readonly kind: "tasks.list" }
  | { readonly kind: "tasks.complete"; readonly taskId: string }
  | { readonly kind: "tasks.reopen"; readonly taskId: string }
  | { readonly kind: "tasks.invalid" };

export function parseTaskCommand(text: string): TaskCommand {
  const separators = Array.from(text.matchAll(/\|/gu));
  const firstSeparator = separators[0]?.index;
  const secondSeparator = separators[1]?.index;
  if (firstSeparator !== undefined && secondSeparator !== undefined) {
    const commandText = text.slice(0, firstSeparator).trim();
    const priority = text.slice(firstSeparator + 1, secondSeparator);
    const title = text.slice(secondSeparator + 1);
    const parts = commandParts(commandText);
    if (parts[1]?.toLowerCase() === "crea" && parts.length === 3) {
      return {
        kind: "tasks.create",
        due: parts[2] ?? "",
        priority,
        title,
      };
    }
  }
  if (separators.length > 0) return { kind: "tasks.invalid" };
  const parts = commandParts(text);
  const operation = parts[1]?.toLowerCase();
  if (operation === "lista" && parts.length === 2) {
    return { kind: "tasks.list" };
  }
  const taskId = parts[2] ?? "";
  if (parts.length !== 3 || !entityIdPattern.test(taskId)) {
    return { kind: "tasks.invalid" };
  }
  switch (operation) {
    case "leggi":
      return { kind: "tasks.read", taskId };
    case "completa":
      return { kind: "tasks.complete", taskId };
    case "riapri":
      return { kind: "tasks.reopen", taskId };
    default:
      return { kind: "tasks.invalid" };
  }
}

export const taskCommandRoutes: readonly CommandRoute<TaskCommand>[] = [
  ["/task", parseTaskCommand],
];

export const taskCommandKinds = [
  "tasks.create",
  "tasks.read",
  "tasks.list",
  "tasks.complete",
  "tasks.reopen",
  "tasks.invalid",
] as const;

export const isTaskCommand = commandKindGuard<TaskCommand>(taskCommandKinds);
