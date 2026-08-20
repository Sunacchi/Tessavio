import { createCommandRegistry } from "../application/handler-registry";
import {
  resolveApiKey,
  type LinkAiCredentialDependencies,
} from "../application/link-ai-credential";
import {
  aiCommandRegistration,
  createProposalExecutor,
} from "../application/manage-ai-proposals";
import { inboxCommandRegistration } from "../application/manage-inbox";
import {
  eventCandidateContributor,
  eventCommandRegistration,
} from "../application/manage-events";
import {
  reminderCandidateContributor,
  reminderCommandRegistration,
} from "../application/manage-reminders";
import {
  taskCandidateContributor,
  taskCommandRegistration,
} from "../application/manage-tasks";
import { financeCommandRegistration } from "../application/manage-finance";
import {
  listCandidateContributor,
  listsCommandRegistration,
} from "../application/manage-lists";
import { workCommandRegistration } from "../application/manage-work";
import type { CommandRegistration } from "../application/handler-registry";
import type { AiProviderPort } from "../application/ports/ai";
import type { TelegramReplyPort } from "../application/ports/telegram";
import type { ProcessAiProposalDependencies } from "../application/process-ai-proposal";
import { modelPolicy } from "../ai/model-policy";
import { MockAiProvider } from "../infrastructure/ai/mock-provider";
import { OpenRouterAuthAdapter } from "../infrastructure/ai/openrouter-auth-adapter";
import { OpenRouterProvider } from "../infrastructure/ai/openrouter-adapter";
import { D1AiProposalRepository } from "../infrastructure/db/ai-proposal-repository";
import {
  D1AiBudgetRepository,
  D1AiCredentialRepository,
  D1AiOauthSessionRepository,
} from "../infrastructure/db/ai-credential-repository";
import { QueueAiJobPublisher } from "../infrastructure/queue/ai-job-queue";
import type { Authorizer } from "../security/authorization";
import { importKek, type KekRing } from "../security/credential-crypto";
import { aiRuntimeConfig, type AppConfig } from "../shared/config";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";
import { logEvent } from "../shared/logger";
import type { SliceRepositories } from "./repositories";

export interface AiRuntime {
  /** Registrazione del comando `/ai`: presente anche in modalità disabilitata. */
  readonly registration: CommandRegistration;
  /**
   * Registrazione dell'Inbox testuale: presente solo con un provider
   * configurato, così senza AI il testo libero resta senza risposta come prima.
   */
  readonly inbox: CommandRegistration | null;
  /** Dipendenze del job AI: `null` quando nessun provider è configurato. */
  readonly job: ProcessAiProposalDependencies | null;
  readonly link: LinkAiCredentialDependencies;
}

/**
 * Anello di KEK: la corrente cifra, le precedenti decifrano soltanto. Assente
 * quando il Worker gira senza AI, e in quel caso il collegamento BYOK non è
 * offerto invece di fallire a metà.
 */
export async function buildKekRing(env: Env): Promise<KekRing | null> {
  const material = env.AI_KEK;
  if (material === undefined || material.length === 0) return null;
  try {
    const version = Number(env.AI_KEK_VERSION ?? "1");
    const current = await importKek(
      material,
      Number.isFinite(version) ? version : 1,
    );
    const previousMaterial = env.AI_KEK_PREVIOUS;
    const previousVersion = Number(env.AI_KEK_PREVIOUS_VERSION ?? "0");
    const previous =
      previousMaterial === undefined ||
      previousMaterial.length === 0 ||
      !Number.isFinite(previousVersion) ||
      previousVersion <= 0
        ? []
        : [await importKek(previousMaterial, previousVersion)];
    return { current, previous };
  } catch {
    logEvent("error", "ai.kek_invalid", { errorCode: "INTERNAL_REDACTED" });
    return null;
  }
}

export async function buildAiLinkDependencies(input: {
  readonly env: Env;
  readonly config: AppConfig;
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly repositories: Pick<SliceRepositories, "preferences">;
}): Promise<LinkAiCredentialDependencies> {
  const ai = aiRuntimeConfig(input.config);
  const adapter = new OpenRouterAuthAdapter(
    ai.providerBaseUrl,
    ai.requestTimeoutMs,
  );
  return {
    authorizer: input.authorizer,
    authorization: adapter,
    clock: input.clock,
    credentials: new D1AiCredentialRepository(input.env.DB),
    ids: input.ids,
    keyInspection: adapter,
    kek: await buildKekRing(input.env),
    publicBaseUrl: ai.publicBaseUrl,
    sessionTtlMs: ai.oauthSessionTtlMs,
    sessions: new D1AiOauthSessionRepository(input.env.DB),
  };
}

/**
 * Composizione della superficie AI. Il registry di esecuzione è costruito con
 * `provenance: "extracted"`: ogni entità creata da una proposta è marcata come
 * estratta per costruzione, non per convenzione.
 */
export async function buildAiRuntime(input: {
  readonly env: Env;
  readonly config: AppConfig;
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly reply: TelegramReplyPort;
  readonly repositories: SliceRepositories;
}): Promise<AiRuntime> {
  const { authorizer, clock, ids, repositories, reply } = input;
  const ai = aiRuntimeConfig(input.config);
  const proposals = new D1AiProposalRepository(input.env.DB);
  const link = await buildAiLinkDependencies(input);

  const executionRegistry = createCommandRegistry([
    eventCommandRegistration({
      authorizer,
      clock,
      events: repositories.events,
      ids,
      preferences: repositories.preferences,
      provenance: "extracted",
      dayViewContributors: [],
    }),
    reminderCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences: repositories.preferences,
      provenance: "extracted",
      reminders: repositories.reminders,
    }),
    taskCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences: repositories.preferences,
      provenance: "extracted",
      tasks: repositories.tasks,
    }),
    financeCommandRegistration({
      authorizer,
      clock,
      finance: repositories.finance,
      ids,
      provenance: "extracted",
    }),
    listsCommandRegistration({
      authorizer,
      clock,
      ids,
      lists: repositories.lists,
      provenance: "extracted",
    }),
    workCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences: repositories.preferences,
      provenance: "extracted",
      work: repositories.work,
    }),
  ]);

  const executor = createProposalExecutor({
    clock,
    commands: executionRegistry,
    effects: repositories.effects,
  });

  const registration = aiCommandRegistration({
    authorizer,
    clock,
    effects: repositories.effects,
    executor,
    ids,
    jobs: new QueueAiJobPublisher(input.env.INBOUND_QUEUE),
    link,
    mode: ai.mode,
    model: ai.model,
    preferences: repositories.preferences,
    proposals,
  });

  if (ai.mode === "disabled") {
    return { registration, inbox: null, job: null, link };
  }

  const inbox = inboxCommandRegistration({
    authorizer,
    clock,
    jobs: new QueueAiJobPublisher(input.env.INBOUND_QUEUE),
    preferences: repositories.preferences,
  });

  const policy = modelPolicy({
    provider: ai.mode,
    model: ai.model,
    maxCostMicrosPerOperation: ai.maxCostMicros,
    dailyBudgetMicrosPerUser: ai.dailyBudgetMicros,
  });
  const provider: AiProviderPort =
    ai.mode === "openrouter"
      ? new OpenRouterProvider(
          ai.providerBaseUrl,
          ai.requestTimeoutMs,
          policy,
          clock,
        )
      : new MockAiProvider();

  return {
    registration,
    inbox,
    link,
    job: {
      authorizer,
      budget: new D1AiBudgetRepository(input.env.DB),
      candidateContributors: [
        eventCandidateContributor({ authorizer, events: repositories.events }),
        reminderCandidateContributor({
          authorizer,
          reminders: repositories.reminders,
        }),
        taskCandidateContributor({ authorizer, tasks: repositories.tasks }),
        listCandidateContributor({ authorizer, lists: repositories.lists }),
      ],
      clock,
      confirmationTtlMs: ai.confirmationTtlMs,
      deliveries: repositories.deliveries,
      executor,
      ids,
      keyInspection: ai.mode === "openrouter" ? link.keyInspection : null,
      leaseSeconds: ai.leaseSeconds,
      policy,
      preferences: repositories.preferences,
      proposals,
      provider,
      reply,
      requiresCredential: ai.mode === "openrouter",
      resolveApiKey: (scope: UserScope) => resolveApiKey(scope, link),
      retentionMs: ai.proposalRetentionMs,
    },
  };
}
