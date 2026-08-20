import type { CommandContext } from "./handler-registry";

/**
 * Ogni slice possiede il prefisso dei propri token di Undo e lo registra: il
 * dispatcher non conosce i domini, conosce i prefissi registrati.
 */
export interface UndoHandler {
  readonly prefix: string;
  handle(token: string, context: CommandContext): Promise<string>;
}

export interface UndoRegistry {
  handlerFor(token: string): UndoHandler | null;
  readonly prefixes: readonly string[];
}

/**
 * I prefissi più lunghi vengono valutati per primi, così un handler senza
 * prefisso resta il fallback esplicito invece di catturare tutto.
 */
export function createUndoRegistry(
  handlers: readonly UndoHandler[],
): UndoRegistry {
  const ordered = [...handlers].sort(
    (left, right) => right.prefix.length - left.prefix.length,
  );
  return {
    prefixes: ordered.map((handler) => handler.prefix),
    handlerFor: (token) =>
      ordered.find((handler) => token.startsWith(handler.prefix)) ?? null,
  };
}
