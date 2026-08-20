import {
  isUndoCommand,
  undoCommandKinds,
  type UndoCommand,
} from "./commands/undo";
import {
  commandRegistration,
  type CommandContext,
  type CommandRegistration,
} from "./handler-registry";
import { createUndoRegistry, type UndoHandler } from "./undo-registry";
import type { Authorizer } from "../security/authorization";

export interface ManageUndoDependencies {
  readonly authorizer: Authorizer;
  /** Un handler per prefisso di token, registrato dalla slice che lo possiede. */
  readonly undoHandlers: readonly UndoHandler[];
}

const usage = "Usa: /annulla <token-opaco>";
const unavailable =
  "Undo non disponibile: nessuna slice registrata riconosce questo token.";

export async function manageUndo(
  command: UndoCommand,
  context: CommandContext,
  dependencies: ManageUndoDependencies,
): Promise<string> {
  await dependencies.authorizer.authorize({
    actorUserId: context.actorUserId,
    scope: context.scope,
    action: "undo:usage",
  });
  if (command.kind === "undo.invalid") return usage;

  const registry = createUndoRegistry(dependencies.undoHandlers);
  const handler = registry.handlerFor(command.token);
  return handler === null
    ? unavailable
    : handler.handle(command.token, context);
}

export function undoCommandRegistration(
  dependencies: ManageUndoDependencies,
): CommandRegistration {
  return commandRegistration<UndoCommand>(
    undoCommandKinds,
    isUndoCommand,
    (command, context) => manageUndo(command, context, dependencies),
  );
}
