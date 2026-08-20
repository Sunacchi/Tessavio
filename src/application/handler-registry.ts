import type { DeterministicCommand } from "./deterministic-command";
import type { UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

export type CommandKind = DeterministicCommand["kind"];

/** Tutto ciò che un handler può sapere del messaggio, senza toccare Telegram. */
export interface CommandContext {
  readonly actorUserId: string;
  readonly scope: UserScope;
  /** Chat Telegram di origine: serve a chi risponde in modo asincrono. */
  readonly chatId: number | string;
  /** Testo del messaggio: lo usa solo chi tratta il testo libero (C3). */
  readonly messageText: string;
  /** Provenance minima dell'Inbox: il testo arriva da un inoltro? */
  readonly forwarded: boolean;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly jobId: string;
  readonly sentAtUnix: number;
}

export interface CommandDocumentReply {
  readonly kind: "document";
  readonly fileName: string;
  readonly mimeType: "text/csv";
  readonly content: string;
  readonly caption: string;
}

export type CommandReply = string | CommandDocumentReply;

export interface CommandRegistration {
  readonly kinds: readonly CommandKind[];
  handle(
    command: DeterministicCommand,
    context: CommandContext,
  ): Promise<CommandReply>;
}

export interface CommandRegistry {
  handle(
    command: DeterministicCommand,
    context: CommandContext,
  ): Promise<CommandReply>;
  has(kind: CommandKind): boolean;
}

/**
 * Risposta quando una slice non è registrata in questa configurazione: il
 * registry risponde in modo utile invece di lanciare.
 */
export const unavailableSliceReply =
  "Questa funzione non è disponibile in questa configurazione del bot.";

/**
 * Costruisce una registrazione a partire dal type guard del dominio: il
 * registry chiama l'handler solo con i comandi che gli appartengono, e la
 * verifica resta esplicita invece di essere un cast.
 */
export function commandRegistration<TCommand extends DeterministicCommand>(
  kinds: readonly CommandKind[],
  matches: (command: DeterministicCommand) => command is TCommand,
  handle: (command: TCommand, context: CommandContext) => Promise<CommandReply>,
): CommandRegistration {
  return {
    kinds,
    handle: (command, context) => {
      if (!matches(command)) throw new AppError("INTERNAL_REDACTED", false);
      return handle(command, context);
    },
  };
}

export function createCommandRegistry(
  registrations: readonly CommandRegistration[],
): CommandRegistry {
  const handlers = new Map<CommandKind, CommandRegistration["handle"]>();
  for (const registration of registrations) {
    for (const kind of registration.kinds) {
      if (handlers.has(kind)) {
        throw new AppError("INTERNAL_REDACTED", false);
      }
      handlers.set(kind, registration.handle.bind(registration));
    }
  }
  return {
    has: (kind) => handlers.has(kind),
    handle: (command, context) => {
      const handle = handlers.get(command.kind);
      return handle === undefined
        ? Promise.resolve(unavailableSliceReply)
        : handle(command, context);
    },
  };
}
