import { aiCommandKinds, isAiCommand, type AiCommand } from "./commands/ai";
import {
  commandForProposal,
  describeProposal,
  parseProposalPlan,
  type ProposalPlanItem,
} from "./ai-plan";
import {
  commandRegistration,
  type CommandContext,
  type CommandRegistration,
  type CommandRegistry,
} from "./handler-registry";
import type { AiProposalRepository, AiJobQueuePort } from "./ports/ai";
import type { EffectRepository } from "./ports/effects";
import type { PreferenceRepository } from "./ports/preferences";
import { c1Actions } from "../domains/ai/proposal";
import type { Authorizer } from "../security/authorization";
import type { AiMode } from "../shared/config";
import type { Clock, IdGenerator } from "../shared/contracts";

export interface ProposalExecutionContext extends CommandContext {
  readonly aiJobId: string;
}

/**
 * Esegue una proposta già validata passando dal registry dei comandi: nessuna
 * scrittura AI ha un percorso privilegiato verso il dominio (invariante 4).
 * L'idempotenza è garantita dal ledger `effects` con chiave per proposta.
 */
export interface ProposalExecutor {
  execute(
    item: ProposalPlanItem,
    context: ProposalExecutionContext,
  ): Promise<string>;
}

export function createProposalExecutor(dependencies: {
  readonly clock: Clock;
  readonly commands: CommandRegistry;
  readonly effects: EffectRepository;
}): ProposalExecutor {
  return {
    execute: async (item, context) => {
      const command = commandForProposal(item.action, item.slots);
      if (command === null) {
        return "Proposta non eseguibile: dati incompleti.";
      }
      const effectKey = `ai-exec:${context.aiJobId}:${String(item.index)}`;
      const claimed = await dependencies.effects.claim(
        context.scope,
        effectKey,
        context.aiJobId,
        dependencies.clock.now(),
        "ai_execution",
      );
      if (!claimed) {
        const status = await dependencies.effects.get(context.scope, effectKey);
        return status === "completed"
          ? "Già applicato in precedenza: nessuna modifica ripetuta."
          : "Elaborazione già in corso per questa proposta.";
      }
      const reply = await dependencies.commands.handle(command, context);
      await dependencies.effects.complete(
        context.scope,
        effectKey,
        dependencies.clock.now(),
      );
      return typeof reply === "string" ? reply : reply.caption;
    },
  };
}

export interface ManageAiProposalsDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly effects: EffectRepository;
  readonly executor: ProposalExecutor;
  readonly ids: IdGenerator;
  readonly jobs: AiJobQueuePort;
  readonly mode: AiMode;
  readonly model: string;
  readonly preferences: PreferenceRepository;
  readonly proposals: AiProposalRepository;
}

const usage = [
  "Usa uno di questi comandi:",
  "/ai — stato della modalità AI",
  "/ai proponi <testo libero>",
  "/ai conferma <token>",
].join("\n");

const notConfigured =
  "AI non configurata: il bot funziona comunque con i comandi espliciti. Vedi /ai per lo stato.";

const missingPreferences =
  "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.";

function statusText(dependencies: ManageAiProposalsDependencies): string {
  if (dependencies.mode === "disabled") {
    return [
      "Modalità AI: non configurata.",
      "Il core deterministico funziona senza provider: usa i comandi espliciti.",
    ].join("\n");
  }
  return [
    `Modalità AI: ${dependencies.mode}.`,
    `Modello: ${dependencies.model}.`,
    `Azioni abilitate: ${c1Actions.join(", ")}.`,
    "Le proposte sono sempre validate dal codice: la fiducia del modello non autorizza nulla.",
    usage,
  ].join("\n");
}

export async function manageAiProposals(
  command: AiCommand,
  context: CommandContext,
  dependencies: ManageAiProposalsDependencies,
): Promise<string> {
  await dependencies.authorizer.authorize({
    actorUserId: context.actorUserId,
    scope: context.scope,
    action: command.kind === "ai.confirm" ? "ai:execute" : "ai:propose",
  });

  if (command.kind === "ai.status") return statusText(dependencies);
  if (command.kind === "ai.invalid") return usage;
  if (dependencies.mode === "disabled") return notConfigured;

  const profile = await dependencies.preferences.get(context.scope);
  if (profile === null) return missingPreferences;

  if (command.kind === "ai.propose") {
    await dependencies.jobs.publish({
      jobId: context.jobId,
      correlationId: context.correlationId,
      idempotencyKey: `ai-propose:${context.idempotencyKey}`,
      userId: context.scope.userId,
      chatId: context.chatId,
      messageText: command.text,
      sentAtUnix: context.sentAtUnix,
      createdAt: dependencies.clock.now().toISOString(),
    });
    return "Sto elaborando la richiesta: ti rispondo con le proposte fra poco.";
  }

  const consumed = await dependencies.proposals.consumeConfirmation(
    context.scope,
    command.token,
    dependencies.clock.now(),
  );
  switch (consumed.outcome) {
    case "not_found":
      return "Conferma non disponibile per questo utente.";
    case "expired":
      return "Conferma scaduta: rifai la richiesta con /ai proponi.";
    case "used":
      return "Conferma già usata: nessuna modifica ripetuta.";
    case "consumed":
      break;
  }
  const plan = parseProposalPlan(consumed.planJson);
  const item = plan?.items.find(
    (entry) => entry.index === consumed.proposalIndex,
  );
  if (item === undefined) {
    return "Proposta non più disponibile: rifai la richiesta con /ai proponi.";
  }
  const reply = await dependencies.executor.execute(item, {
    ...context,
    aiJobId: consumed.jobId,
    idempotencyKey: `ai-exec:${consumed.jobId}:${String(item.index)}`,
  });
  return [`Confermato: ${describeProposal(item)}`, reply].join("\n");
}

export function aiCommandRegistration(
  dependencies: ManageAiProposalsDependencies,
): CommandRegistration {
  return commandRegistration<AiCommand>(
    aiCommandKinds,
    isAiCommand,
    (command, context) => manageAiProposals(command, context, dependencies),
  );
}
