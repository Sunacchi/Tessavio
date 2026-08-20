import { createCommandRegistry } from "../application/handler-registry";
import {
  aiCommandRegistration,
  createProposalExecutor,
} from "../application/manage-ai-proposals";
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
import type { CommandRegistration } from "../application/handler-registry";
import type { AiProviderPort } from "../application/ports/ai";
import type { TelegramReplyPort } from "../application/ports/telegram";
import type { ProcessAiProposalDependencies } from "../application/process-ai-proposal";
import { modelPolicy } from "../ai/model-policy";
import { D1AiProposalRepository } from "../infrastructure/db/ai-proposal-repository";
import { MockAiProvider } from "../infrastructure/ai/mock-provider";
import { QueueAiJobPublisher } from "../infrastructure/queue/ai-job-queue";
import type { Authorizer } from "../security/authorization";
import { aiRuntimeConfig, type AppConfig } from "../shared/config";
import type { Clock, IdGenerator } from "../shared/contracts";
import type { SliceRepositories } from "./repositories";

export interface AiRuntime {
  /** Registrazione del comando `/ai`: presente anche in modalità disabilitata. */
  readonly registration: CommandRegistration;
  /** Dipendenze del job AI: `null` quando nessun provider è configurato. */
  readonly job: ProcessAiProposalDependencies | null;
}

export function buildAiRuntime(input: {
  readonly env: Env;
  readonly config: AppConfig;
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly reply: TelegramReplyPort;
  readonly repositories: SliceRepositories;
}): AiRuntime {
  const { authorizer, clock, ids, repositories, reply } = input;
  const ai = aiRuntimeConfig(input.config);
  const proposals = new D1AiProposalRepository(input.env.DB);

  /**
   * Registry dedicato all'esecuzione delle proposte: contiene solo le slice
   * raggiungibili dall'enum ed è costruito con `provenance: "extracted"`, così
   * ogni entità creata da una proposta è marcata come estratta per costruzione.
   */
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
    mode: ai.mode,
    model: ai.model,
    preferences: repositories.preferences,
    proposals,
  });

  if (ai.mode === "disabled") return { registration, job: null };

  const provider: AiProviderPort = new MockAiProvider();
  const policy = modelPolicy({
    provider: ai.mode,
    model: ai.model,
    maxCostMicrosPerOperation: ai.maxCostMicros,
    dailyBudgetMicrosPerUser: ai.dailyBudgetMicros,
  });

  return {
    registration,
    job: {
      authorizer,
      candidateContributors: [
        eventCandidateContributor({ authorizer, events: repositories.events }),
        reminderCandidateContributor({
          authorizer,
          reminders: repositories.reminders,
        }),
        taskCandidateContributor({ authorizer, tasks: repositories.tasks }),
      ],
      clock,
      confirmationTtlMs: ai.confirmationTtlMs,
      deliveries: repositories.deliveries,
      executor,
      ids,
      leaseSeconds: ai.leaseSeconds,
      policy,
      preferences: repositories.preferences,
      proposals,
      provider,
      reply,
      retentionMs: ai.proposalRetentionMs,
    },
  };
}
