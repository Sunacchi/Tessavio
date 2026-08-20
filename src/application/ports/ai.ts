import type { JsonSchemaNode } from "../../domains/ai/strict-schema";
import type { AiAction } from "../../domains/ai/proposal";
import type { ProposalCandidate } from "../../domains/ai/validate-proposal";
import type { UserScope } from "../../shared/contracts";

/** Contesto minimo inviato al provider (ADR-0023): nessun ID, nessun dato dal DB. */
export interface AiPromptContext {
  readonly messageText: string;
  readonly timeZone: string;
  readonly localDate: string;
  readonly enabledActions: readonly AiAction[];
}

export interface AiProviderRequest {
  readonly context: AiPromptContext;
  readonly schema: JsonSchemaNode;
  readonly model: string;
  readonly apiKey: string | null;
  readonly correlationId: string;
  readonly maxCostMicros: number;
}

export interface AiProviderResult {
  readonly rawJson: string;
  readonly model: string;
  readonly costMicros: number;
  readonly latencyMs: number;
}

export interface AiProviderPort {
  propose(request: AiProviderRequest): Promise<AiProviderResult>;
}

export type ProposalDomain = "events" | "reminders" | "tasks";

/**
 * Ogni slice raggiungibile dall'enum registra da sé come si cercano le proprie
 * entità: la lookup è tenant-scoped e non lascia il layer application.
 */
export interface ProposalCandidateContributor {
  readonly domain: ProposalDomain;
  collect(
    scope: UserScope,
    context: {
      readonly actorUserId: string;
      readonly referenceInstant: Date;
      readonly timeZone: string;
      readonly limit: number;
    },
  ): Promise<readonly ProposalCandidate[]>;
}

export type AiJobClaim = "claimed" | "busy" | "resumed" | "settled";

export interface AiJobRegistration {
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly schemaVersion: string;
  readonly policyVersion: string;
  readonly model: string;
  readonly expiresAt: Date;
}

export interface AiJobRecord {
  readonly jobId: string;
  readonly status: "claimed" | "planned" | "completed" | "failed";
  readonly planJson: string | null;
  readonly replyText: string | null;
}

export type ConsumeConfirmationResult =
  | {
      readonly outcome: "consumed";
      readonly jobId: string;
      readonly proposalIndex: number;
      readonly planJson: string;
    }
  | { readonly outcome: "not_found" | "expired" | "used" };

export interface AiProposalRepository {
  claim(
    scope: UserScope,
    jobId: string,
    registration: AiJobRegistration,
    now: Date,
    leaseSeconds: number,
  ): Promise<AiJobClaim>;
  savePlan(
    scope: UserScope,
    jobId: string,
    planJson: string,
    now: Date,
  ): Promise<void>;
  complete(
    scope: UserScope,
    jobId: string,
    replyText: string,
    now: Date,
  ): Promise<void>;
  fail(
    scope: UserScope,
    jobId: string,
    failureCode: string,
    now: Date,
  ): Promise<void>;
  get(scope: UserScope, jobId: string): Promise<AiJobRecord | null>;
  createConfirmation(
    scope: UserScope,
    token: string,
    jobId: string,
    proposalIndex: number,
    expiresAt: Date,
    now: Date,
  ): Promise<void>;
  consumeConfirmation(
    scope: UserScope,
    token: string,
    now: Date,
  ): Promise<ConsumeConfirmationResult>;
  purgeExpired(before: Date, limit: number): Promise<number>;
}

/** Pubblicazione del job AI: il comando inbound resta veloce e deterministico. */
export interface AiJobQueuePort {
  publish(payload: {
    readonly jobId: string;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly userId: string;
    readonly chatId: number | string;
    readonly messageText: string;
    readonly sentAtUnix: number;
    readonly createdAt: string;
  }): Promise<void>;
}
