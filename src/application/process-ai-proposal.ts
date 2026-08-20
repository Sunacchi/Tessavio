import {
  describeProposal,
  parseProposalPlan,
  type ProposalPlan,
  type ProposalPlanItem,
} from "./ai-plan";
import type { CommandContext } from "./handler-registry";
import type { ProposalExecutor } from "./manage-ai-proposals";
import type {
  AiProposalRepository,
  AiProviderPort,
  ProposalCandidateContributor,
} from "./ports/ai";
import type { DeliveryRepository } from "./ports/delivery";
import type { PreferenceRepository } from "./ports/preferences";
import type { TelegramReplyPort } from "./ports/telegram";
import type { AiProposalJobEnvelope } from "./queue-envelope";
import { eventDayWindow } from "../domains/events/events";
import {
  confirmationPolicyVersion,
  decideConfirmation,
} from "../domains/ai/confirmation-policy";
import {
  aiEnvelopeSchema,
  aiProposalSchemaVersion,
  type AiAction,
} from "../domains/ai/proposal";
import { buildStrictProposalSchema } from "../domains/ai/strict-schema";
import {
  validateProposalBatch,
  type ProposalCandidates,
  type ProposalValidation,
} from "../domains/ai/validate-proposal";
import type { AiModelPolicy } from "../ai/model-policy";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

export interface ProcessAiProposalDependencies {
  readonly authorizer: Authorizer;
  readonly candidateContributors: readonly ProposalCandidateContributor[];
  readonly clock: Clock;
  readonly confirmationTtlMs: number;
  readonly deliveries: DeliveryRepository;
  readonly executor: ProposalExecutor;
  readonly ids: IdGenerator;
  readonly leaseSeconds: number;
  readonly policy: AiModelPolicy;
  readonly preferences: PreferenceRepository;
  readonly proposals: AiProposalRepository;
  readonly provider: AiProviderPort;
  readonly reply: TelegramReplyPort;
  readonly retentionMs: number;
}

export interface ProcessAiProposalResult {
  readonly outcome: "completed" | "duplicate" | "recovered" | "failed";
}

const candidateLimit = 50;
const referenceActions: ReadonlySet<AiAction> = new Set([
  "events.cancel",
  "reminders.cancel",
  "tasks.complete",
]);

const invalidOutputReply = [
  "Non sono riuscito a interpretare la risposta del modello, quindi non ho scritto nulla.",
  "Puoi riprovare o usare un comando esplicito, per esempio /evento crea ora 2026-08-20T10:00 2026-08-20T11:00 | Titolo.",
].join("\n");

async function collectCandidates(
  dependencies: ProcessAiProposalDependencies,
  scope: UserScope,
  actorUserId: string,
  referenceInstant: Date,
  timeZone: string,
): Promise<ProposalCandidates> {
  const empty: ProposalCandidates = { events: [], reminders: [], tasks: [] };
  const collected = await Promise.all(
    dependencies.candidateContributors.map(async (contributor) => ({
      domain: contributor.domain,
      candidates: await contributor.collect(scope, {
        actorUserId,
        referenceInstant,
        timeZone,
        limit: candidateLimit,
      }),
    })),
  );
  return collected.reduce<ProposalCandidates>(
    (accumulator, entry) => ({
      ...accumulator,
      [entry.domain]: entry.candidates,
    }),
    empty,
  );
}

function planItem(
  index: number,
  validation: ProposalValidation,
  enabledActions: readonly AiAction[],
): ProposalPlanItem {
  if (validation.outcome === "valid") {
    const decision = decideConfirmation({
      action: validation.action,
      enabled: enabledActions.includes(validation.action),
      resolution: validation.resolution,
      entityCount: validation.entityCount,
    });
    return {
      index,
      action: validation.action,
      decision,
      slots: validation.slots,
      assumptions: [...validation.assumptions],
      message: null,
    };
  }
  if (validation.outcome === "clarify") {
    return {
      index,
      action: validation.action,
      decision: "clarify",
      slots: {
        title: null,
        text: null,
        startLocal: null,
        endLocal: null,
        localDate: null,
        due: null,
        priority: null,
        entityId: null,
      },
      assumptions: [],
      message: validation.question,
    };
  }
  return {
    index,
    action: validation.action,
    decision: "reject",
    slots: {
      title: null,
      text: null,
      startLocal: null,
      endLocal: null,
      localDate: null,
      due: null,
      priority: null,
      entityId: null,
    },
    assumptions: [],
    message: rejectMessage(validation.reason),
  };
}

function rejectMessage(reason: string): string {
  switch (reason) {
    case "action_not_enabled":
      return "Questa azione non è abilitata in questa fase.";
    case "extraneous_slot":
      return "La proposta conteneva campi non pertinenti: l'ho scartata.";
    case "duplicate_in_batch":
      return "Proposta duplicata nello stesso messaggio: applicata una sola volta.";
    case "batch_limit":
      return "Troppe entità in un solo messaggio: dividi la richiesta.";
    default:
      return "Proposta non valida: l'ho scartata senza scrivere nulla.";
  }
}

export async function processAiProposal(
  envelope: AiProposalJobEnvelope,
  dependencies: ProcessAiProposalDependencies,
): Promise<ProcessAiProposalResult> {
  const scope: UserScope = { userId: envelope.payload.userId };
  const now = dependencies.clock.now();
  const claim = await dependencies.proposals.claim(
    scope,
    envelope.jobId,
    {
      correlationId: envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      schemaVersion: aiProposalSchemaVersion,
      policyVersion: confirmationPolicyVersion,
      model: dependencies.policy.model,
      expiresAt: new Date(now.getTime() + dependencies.retentionMs),
    },
    now,
    dependencies.leaseSeconds,
  );
  if (claim === "settled") return { outcome: "duplicate" };
  if (claim === "busy") throw new AppError("DUPLICATE", true);

  await dependencies.authorizer.authorize({
    actorUserId: scope.userId,
    scope,
    action: "ai:propose",
  });

  const profile = await dependencies.preferences.get(scope);
  if (profile === null) {
    return finish(
      dependencies,
      scope,
      envelope,
      "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.",
    );
  }

  const referenceInstant = new Date(envelope.payload.sentAtUnix * 1_000);
  let plan: ProposalPlan | null =
    claim === "resumed"
      ? await storedPlan(dependencies, scope, envelope)
      : null;

  if (plan === null) {
    const window = eventDayWindow(
      envelope.payload.sentAtUnix,
      profile.timeZone,
      0,
    );
    const result = await dependencies.provider.propose({
      context: {
        messageText: envelope.payload.messageText,
        timeZone: profile.timeZone,
        localDate: window.localDate,
        enabledActions: dependencies.policy.enabledActions,
      },
      schema: buildStrictProposalSchema(dependencies.policy.enabledActions),
      model: dependencies.policy.model,
      apiKey: null,
      correlationId: envelope.correlationId,
      maxCostMicros: dependencies.policy.maxCostMicrosPerOperation,
    });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(result.rawJson);
    } catch {
      return failWith(dependencies, scope, envelope, "invalid_json");
    }
    const parsed = aiEnvelopeSchema(
      dependencies.policy.enabledActions,
    ).safeParse(parsedJson);
    if (!parsed.success) {
      return failWith(dependencies, scope, envelope, "schema_violation");
    }

    const needsCandidates = parsed.data.proposals.some((proposal) =>
      referenceActions.has(proposal.action),
    );
    const candidates = needsCandidates
      ? await collectCandidates(
          dependencies,
          scope,
          scope.userId,
          referenceInstant,
          profile.timeZone,
        )
      : { events: [], reminders: [], tasks: [] };

    const validations = validateProposalBatch(parsed.data, {
      enabledActions: dependencies.policy.enabledActions,
      timeZone: profile.timeZone,
      referenceInstant,
      candidates,
    });
    plan = {
      schemaVersion: aiProposalSchemaVersion,
      policyVersion: confirmationPolicyVersion,
      model: result.model,
      clarification: parsed.data.clarification,
      items: validations.map((validation, index) =>
        planItem(index, validation, dependencies.policy.enabledActions),
      ),
    };
    await dependencies.proposals.savePlan(
      scope,
      envelope.jobId,
      JSON.stringify(plan),
      dependencies.clock.now(),
    );
  }

  const lines: string[] = [];
  let position = 0;
  for (const item of plan.items) {
    position += 1;
    const heading = `${String(position)}. ${describeProposal(item)}`;
    if (item.decision === "execute_with_undo") {
      const reply = await dependencies.executor.execute(item, {
        ...commandContext(envelope, scope),
        aiJobId: envelope.jobId,
        idempotencyKey: `ai-exec:${envelope.jobId}:${String(item.index)}`,
      });
      lines.push(`${heading}\n  ${reply.split("\n").join("\n  ")}`);
      continue;
    }
    if (item.decision === "preview_confirm") {
      const token = `aic_${dependencies.ids.newId()}`;
      await dependencies.proposals.createConfirmation(
        scope,
        token,
        envelope.jobId,
        item.index,
        new Date(
          dependencies.clock.now().getTime() + dependencies.confirmationTtlMs,
        ),
        dependencies.clock.now(),
      );
      lines.push(`${heading}\n  Confermi? /ai conferma ${token}`);
      continue;
    }
    lines.push(
      `${heading}\n  ${item.message ?? "Nessuna modifica applicata."}`,
    );
  }

  if (plan.clarification !== null) lines.push(plan.clarification);
  const replyText =
    lines.length === 0
      ? "Non ho trovato nulla da proporre: prova con un comando esplicito."
      : ["Ho capito questo:", ...lines].join("\n");
  return finish(dependencies, scope, envelope, replyText);
}

function commandContext(
  envelope: AiProposalJobEnvelope,
  scope: UserScope,
): CommandContext {
  return {
    actorUserId: scope.userId,
    scope,
    chatId: envelope.payload.chatId,
    correlationId: envelope.correlationId,
    idempotencyKey: envelope.idempotencyKey,
    jobId: envelope.jobId,
    sentAtUnix: envelope.payload.sentAtUnix,
  };
}

async function storedPlan(
  dependencies: ProcessAiProposalDependencies,
  scope: UserScope,
  envelope: AiProposalJobEnvelope,
): Promise<ProposalPlan | null> {
  const record = await dependencies.proposals.get(scope, envelope.jobId);
  return record?.planJson == null ? null : parseProposalPlan(record.planJson);
}

async function failWith(
  dependencies: ProcessAiProposalDependencies,
  scope: UserScope,
  envelope: AiProposalJobEnvelope,
  failureCode: string,
): Promise<ProcessAiProposalResult> {
  await dependencies.proposals.fail(
    scope,
    envelope.jobId,
    failureCode,
    dependencies.clock.now(),
  );
  await deliver(dependencies, scope, envelope, invalidOutputReply);
  return { outcome: "failed" };
}

async function finish(
  dependencies: ProcessAiProposalDependencies,
  scope: UserScope,
  envelope: AiProposalJobEnvelope,
  replyText: string,
): Promise<ProcessAiProposalResult> {
  await dependencies.proposals.complete(
    scope,
    envelope.jobId,
    replyText,
    dependencies.clock.now(),
  );
  await deliver(dependencies, scope, envelope, replyText);
  return { outcome: "completed" };
}

/** Consegna con lo stesso ledger delle risposte deterministiche. */
async function deliver(
  dependencies: ProcessAiProposalDependencies,
  scope: UserScope,
  envelope: AiProposalJobEnvelope,
  replyText: string,
): Promise<void> {
  const deliveryKey = `telegram-reply:ai:${envelope.jobId}`;
  await dependencies.deliveries.prepare(
    scope,
    deliveryKey,
    envelope.jobId,
    dependencies.clock.now(),
  );
  const action = await dependencies.deliveries.begin(
    scope,
    deliveryKey,
    dependencies.clock.now(),
  );
  if (action !== "send") return;
  try {
    const sent = await dependencies.reply.send(
      envelope.payload.chatId,
      replyText,
    );
    await dependencies.deliveries.markSent(
      scope,
      deliveryKey,
      sent.messageId,
      dependencies.clock.now(),
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "RETRYABLE_EXTERNAL") {
      await dependencies.deliveries.markRetryableFailure(
        scope,
        deliveryKey,
        dependencies.clock.now(),
      );
      throw error;
    }
    if (error instanceof AppError && error.code === "PERMANENT_EXTERNAL") {
      await dependencies.deliveries.markPermanentFailure(
        scope,
        deliveryKey,
        dependencies.clock.now(),
      );
      return;
    }
    await dependencies.deliveries.markAmbiguous(
      scope,
      deliveryKey,
      dependencies.clock.now(),
    );
  }
}
