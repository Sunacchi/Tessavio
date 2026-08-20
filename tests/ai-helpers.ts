import { createCommandRegistry } from "../src/application/handler-registry";
import {
  aiCommandRegistration,
  createProposalExecutor,
} from "../src/application/manage-ai-proposals";
import {
  eventCandidateContributor,
  eventCommandRegistration,
} from "../src/application/manage-events";
import { onboardingCommandRegistration } from "../src/application/manage-onboarding";
import { preferenceCommandRegistration } from "../src/application/manage-preferences";
import {
  reminderCandidateContributor,
  reminderCommandRegistration,
} from "../src/application/manage-reminders";
import {
  taskCandidateContributor,
  taskCommandRegistration,
} from "../src/application/manage-tasks";
import { financeCommandRegistration } from "../src/application/manage-finance";
import {
  listCandidateContributor,
  listsCommandRegistration,
} from "../src/application/manage-lists";
import { workCommandRegistration } from "../src/application/manage-work";
import type {
  AiJobQueuePort,
  AiProviderPort,
} from "../src/application/ports/ai";
import type {
  AiAuthorizationPort,
  AiKeyInspectionPort,
} from "../src/application/ports/ai-credentials";
import type { TelegramReplyPort } from "../src/application/ports/telegram";
import type { ProcessAiProposalDependencies } from "../src/application/process-ai-proposal";
import {
  resolveApiKey,
  type LinkAiCredentialDependencies,
} from "../src/application/link-ai-credential";
import type { ProcessInboundDependencies } from "../src/application/process-inbound";
import type { AiProposalJobEnvelope } from "../src/application/queue-envelope";
import { modelPolicy } from "../src/ai/model-policy";
import { c12Actions, type AiAction } from "../src/domains/ai/proposal";
import { D1AiProposalRepository } from "../src/infrastructure/db/ai-proposal-repository";
import {
  D1AiBudgetRepository,
  D1AiCredentialRepository,
  D1AiOauthSessionRepository,
} from "../src/infrastructure/db/ai-credential-repository";
import { D1DeliveryRepository } from "../src/infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../src/infrastructure/db/effect-repository";
import { D1EventRepository } from "../src/infrastructure/db/event-repository";
import { D1IdentityRepository } from "../src/infrastructure/db/identity-repository";
import { D1InboundRepository } from "../src/infrastructure/db/inbound-repository";
import { D1PreferenceRepository } from "../src/infrastructure/db/preference-repository";
import { D1ReminderRepository } from "../src/infrastructure/db/reminder-repository";
import { D1TaskRepository } from "../src/infrastructure/db/task-repository";
import { D1FinanceRepository } from "../src/infrastructure/db/finance-repository";
import { D1ListRepository } from "../src/infrastructure/db/list-repository";
import { D1WorkRepository } from "../src/infrastructure/db/work-repository";
import { MockAiProvider } from "../src/infrastructure/ai/mock-provider";
import { SelfScopeAuthorizer } from "../src/security/authorization";
import type { AiMode } from "../src/shared/config";
import type { KekRing } from "../src/security/credential-crypto";
import type { Clock, IdGenerator, UserScope } from "../src/shared/contracts";

export class CapturingAiQueue implements AiJobQueuePort {
  readonly published: {
    readonly jobId: string;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly userId: string;
    readonly chatId: number | string;
    readonly messageText: string;
    readonly sentAtUnix: number;
    readonly createdAt: string;
  }[] = [];

  publish(payload: {
    readonly jobId: string;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly userId: string;
    readonly chatId: number | string;
    readonly messageText: string;
    readonly sentAtUnix: number;
    readonly createdAt: string;
  }): Promise<void> {
    this.published.push(payload);
    return Promise.resolve();
  }

  envelope(index = 0): AiProposalJobEnvelope {
    const payload = this.published[index];
    if (payload === undefined) throw new Error("nessun job AI pubblicato");
    return {
      version: 1,
      type: "AI_PROPOSAL",
      jobId: payload.jobId,
      correlationId: payload.correlationId,
      idempotencyKey: payload.idempotencyKey,
      createdAt: payload.createdAt,
      attempt: 0,
      payload: {
        userId: payload.userId,
        chatId: payload.chatId,
        messageText: payload.messageText,
        sentAtUnix: payload.sentAtUnix,
      },
    };
  }
}

export interface AiTestRuntime {
  readonly inbound: ProcessInboundDependencies;
  readonly aiJob: ProcessAiProposalDependencies;
  readonly queue: CapturingAiQueue;
  readonly proposals: D1AiProposalRepository;
  readonly inbox: D1InboundRepository;
  readonly link: LinkAiCredentialDependencies;
  readonly budget: D1AiBudgetRepository;
}

/**
 * Runtime di test con provider mock: nessuna rete, nessuna credenziale. Le
 * slice registrate sono solo quelle raggiungibili dall'enum C1.
 */
export function createAiTestRuntime(
  database: D1Database,
  options: {
    readonly clock: Clock;
    readonly ids: IdGenerator;
    readonly reply: TelegramReplyPort;
    readonly provider?: AiProviderPort;
    readonly mode?: AiMode;
    readonly leaseSeconds?: number;
    readonly enabledActions?: readonly AiAction[];
    readonly confirmationTtlMs?: number;
    readonly kek?: KekRing | null;
    readonly authorization?: AiAuthorizationPort;
    readonly keyInspection?: AiKeyInspectionPort | null;
    readonly publicBaseUrl?: string | null;
    readonly requiresCredential?: boolean;
    readonly dailyBudgetMicros?: number;
    readonly maxCostMicros?: number;
  },
): AiTestRuntime {
  const authorizer = new SelfScopeAuthorizer();
  const { clock, ids, reply } = options;
  const deliveries = new D1DeliveryRepository(database);
  const effects = new D1EffectRepository(database);
  const events = new D1EventRepository(database);
  const identities = new D1IdentityRepository(database);
  const inbox = new D1InboundRepository(database);
  const preferences = new D1PreferenceRepository(database);
  const reminders = new D1ReminderRepository(database);
  const tasks = new D1TaskRepository(database);
  const finance = new D1FinanceRepository(database);
  const lists = new D1ListRepository(database);
  const work = new D1WorkRepository(database);
  const proposals = new D1AiProposalRepository(database);
  const queue = new CapturingAiQueue();
  const mode = options.mode ?? "mock";
  const credentials = new D1AiCredentialRepository(database);
  const sessions = new D1AiOauthSessionRepository(database);
  const budget = new D1AiBudgetRepository(database);
  const link: LinkAiCredentialDependencies = {
    authorizer,
    authorization: options.authorization ?? {
      authorizeUrl: () => "https://provider.test/auth",
      exchange: () => Promise.resolve({ outcome: "rejected" as const }),
    },
    clock,
    credentials,
    ids,
    keyInspection: options.keyInspection ?? {
      inspect: () => Promise.resolve(null),
    },
    kek: options.kek ?? null,
    publicBaseUrl: options.publicBaseUrl ?? null,
    sessionTtlMs: 10 * 60 * 1_000,
    sessions,
  };

  const executionRegistry = createCommandRegistry([
    eventCommandRegistration({
      authorizer,
      clock,
      events,
      ids,
      preferences,
      provenance: "extracted",
      dayViewContributors: [],
    }),
    reminderCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "extracted",
      reminders,
    }),
    taskCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "extracted",
      tasks,
    }),
    financeCommandRegistration({
      authorizer,
      clock,
      finance,
      ids,
      provenance: "extracted",
    }),
    listsCommandRegistration({
      authorizer,
      clock,
      ids,
      lists,
      provenance: "extracted",
    }),
    workCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "extracted",
      work,
    }),
  ]);
  const executor = createProposalExecutor({
    clock,
    commands: executionRegistry,
    effects,
  });

  const commands = createCommandRegistry([
    onboardingCommandRegistration({ authorizer, clock, effects }),
    preferenceCommandRegistration({ authorizer, clock, ids, preferences }),
    eventCommandRegistration({
      authorizer,
      clock,
      events,
      ids,
      preferences,
      provenance: "entered",
      dayViewContributors: [],
    }),
    taskCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "entered",
      tasks,
    }),
    reminderCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "entered",
      reminders,
    }),
    financeCommandRegistration({
      authorizer,
      clock,
      finance,
      ids,
      provenance: "entered",
    }),
    listsCommandRegistration({
      authorizer,
      clock,
      ids,
      lists,
      provenance: "entered",
    }),
    workCommandRegistration({
      authorizer,
      clock,
      ids,
      preferences,
      provenance: "entered",
      work,
    }),
    aiCommandRegistration({
      authorizer,
      clock,
      effects,
      executor,
      ids,
      jobs: queue,
      link,
      mode,
      model: "mock/deterministic-v1",
      preferences,
      proposals,
    }),
  ]);

  return {
    inbound: {
      clock,
      commands,
      deliveries,
      identities,
      ids,
      inbox,
      reply,
      leaseSeconds: 60,
    },
    aiJob: {
      authorizer,
      budget,
      keyInspection: options.keyInspection ?? null,
      requiresCredential: options.requiresCredential ?? false,
      resolveApiKey: (scope: UserScope) => resolveApiKey(scope, link),
      candidateContributors: [
        eventCandidateContributor({ authorizer, events }),
        reminderCandidateContributor({ authorizer, reminders }),
        taskCandidateContributor({ authorizer, tasks }),
        listCandidateContributor({ authorizer, lists }),
      ],
      clock,
      confirmationTtlMs: options.confirmationTtlMs ?? 15 * 60 * 1_000,
      deliveries,
      executor,
      ids,
      leaseSeconds: options.leaseSeconds ?? 180,
      policy: modelPolicy({
        provider: "mock",
        model: "mock/deterministic-v1",
        maxCostMicrosPerOperation: options.maxCostMicros ?? 5_000,
        dailyBudgetMicrosPerUser: options.dailyBudgetMicros ?? 500_000,
        enabledActions: options.enabledActions ?? c12Actions,
      }),
      preferences,
      proposals,
      provider: options.provider ?? new MockAiProvider(),
      reply,
      retentionMs: 30 * 24 * 60 * 60 * 1_000,
    },
    queue,
    proposals,
    inbox,
    link,
    budget,
  };
}
