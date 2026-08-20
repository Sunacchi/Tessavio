export interface UnsupportedCommand {
  readonly kind: "unsupported";
}

/**
 * Una route associa la parola di comando Telegram al parser del suo dominio.
 * Il dispatch centrale non conosce i domini: li compone da queste route.
 */
export type CommandRoute<TCommand> = readonly [
  keyword: string,
  parse: (normalizedText: string) => TCommand,
];

export const opaqueTokenPattern = /^[A-Za-z0-9_-]{16,128}$/u;
export const entityIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

export const unsupported: UnsupportedCommand = { kind: "unsupported" };

export function commandParts(text: string): readonly string[] {
  return text.split(/\s+/u);
}

export function parsePositiveVersion(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/u.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

/**
 * Costruisce il type guard di un dominio dalla lista dei suoi `kind`: il
 * controllo resta a runtime e il registry non ha bisogno di cast.
 */
export function commandKindGuard<TCommand extends { readonly kind: string }>(
  kinds: readonly TCommand["kind"][],
): (command: { readonly kind: string }) => command is TCommand {
  const registered = new Set<string>(kinds);
  return (command): command is TCommand => registered.has(command.kind);
}
