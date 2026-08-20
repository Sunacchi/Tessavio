import {
  commandRegistration,
  type CommandContext,
  type CommandRegistration,
} from "./handler-registry";
import type { AiJobQueuePort } from "./ports/ai";
import type { PreferenceRepository } from "./ports/preferences";
import type { UnsupportedCommand } from "./commands/shared";
import {
  unsupportedCommandKinds,
  isUnsupportedCommand,
} from "./commands/shared";
import type { Authorizer } from "../security/authorization";
import type { Clock } from "../shared/contracts";

/**
 * C3 — Inbox testuale. Il testo che nessun comando riconosce diventa lavoro
 * dell'Inbox: viene instradato verso lo **stesso** percorso delle proposte, che
 * a sua volta passa dal registry dei comandi. Nessuna entità nuova, nessuna
 * regola di dominio duplicata (ADR-0010, ADR-0026).
 *
 * I link non vengono scaricati: un URL resta testo e metadato.
 */
export interface ManageInboxDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly jobs: AiJobQueuePort;
  readonly preferences: PreferenceRepository;
}

const missingPreferences =
  "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.";

/** Sotto questa soglia il testo non è una richiesta: è una reazione. */
const minimumInboxCharacters = 8;

export async function manageInbox(
  context: CommandContext,
  dependencies: ManageInboxDependencies,
): Promise<string> {
  const text = context.messageText.trim();
  if (text.length < minimumInboxCharacters) return "";

  await dependencies.authorizer.authorize({
    actorUserId: context.actorUserId,
    scope: context.scope,
    action: "ai:propose",
  });
  const profile = await dependencies.preferences.get(context.scope);
  if (profile === null) return missingPreferences;

  await dependencies.jobs.publish({
    jobId: context.jobId,
    correlationId: context.correlationId,
    idempotencyKey: `ai-inbox:${context.idempotencyKey}`,
    userId: context.scope.userId,
    chatId: context.chatId,
    messageText: text,
    sentAtUnix: context.sentAtUnix,
    forwarded: context.forwarded,
    origin: "inbox",
    createdAt: dependencies.clock.now().toISOString(),
  });
  // Nessuna risposta immediata: l'Inbox parla solo se ha qualcosa da proporre.
  return "";
}

export function inboxCommandRegistration(
  dependencies: ManageInboxDependencies,
): CommandRegistration {
  return commandRegistration<UnsupportedCommand>(
    unsupportedCommandKinds,
    isUnsupportedCommand,
    (_command, context) => manageInbox(context, dependencies),
  );
}
