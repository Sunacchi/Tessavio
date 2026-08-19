import { commandParts, opaqueTokenPattern, type CommandRoute } from "./shared";

export type UndoCommand =
  | { readonly kind: "undo"; readonly token: string }
  | { readonly kind: "undo.invalid" };

export function parseUndoCommand(text: string): UndoCommand {
  const parts = commandParts(text);
  const token = parts[1];
  if (
    parts.length === 2 &&
    token !== undefined &&
    opaqueTokenPattern.test(token)
  ) {
    return { kind: "undo", token };
  }
  return { kind: "undo.invalid" };
}

export const undoCommandRoutes: readonly CommandRoute<UndoCommand>[] = [
  ["/annulla", parseUndoCommand],
];
