import { c1Actions, type AiAction } from "../domains/ai/proposal";

/**
 * Configurazione versionata di modelli, privacy e costo (ADR-0025). Non è
 * dominio: è una policy che cambia senza toccare le regole di business.
 *
 * I costi sono in **micro-unità di valuta intere** (milionesimi di USD): mai
 * float sul denaro, invariante 8.
 */
export type AiProviderKind = "mock" | "openrouter";

export interface AiModelPolicy {
  readonly provider: AiProviderKind;
  readonly model: string;
  /** Endpoint ammessi per privacy e costo; vuoto = nessun vincolo di routing. */
  readonly allowedModels: readonly string[];
  readonly dataCollection: "deny";
  readonly zeroDataRetention: true;
  readonly requireStructuredOutputs: true;
  readonly maxCostMicrosPerOperation: number;
  readonly dailyBudgetMicrosPerUser: number;
  readonly enabledActions: readonly AiAction[];
}

export const mockModel = "mock/deterministic-v1";

/** Allowlist C2: modelli con structured outputs verificati e privacy strict. */
export const openRouterAllowlist: readonly string[] = [
  "openai/gpt-4.1-mini",
  "anthropic/claude-3.5-haiku",
];

export const defaultMaxCostMicrosPerOperation = 5_000;
export const defaultDailyBudgetMicrosPerUser = 500_000;

export function modelPolicy(input: {
  readonly provider: AiProviderKind;
  readonly model: string;
  readonly maxCostMicrosPerOperation: number;
  readonly dailyBudgetMicrosPerUser: number;
  readonly enabledActions?: readonly AiAction[];
}): AiModelPolicy {
  return {
    provider: input.provider,
    model: input.model,
    allowedModels: input.provider === "mock" ? [] : openRouterAllowlist,
    dataCollection: "deny",
    zeroDataRetention: true,
    requireStructuredOutputs: true,
    maxCostMicrosPerOperation: input.maxCostMicrosPerOperation,
    dailyBudgetMicrosPerUser: input.dailyBudgetMicrosPerUser,
    enabledActions: input.enabledActions ?? c1Actions,
  };
}

/** Un modello fuori allowlist non è un fallback: è un rifiuto esplicito. */
export function isModelAllowed(policy: AiModelPolicy, model: string): boolean {
  return policy.allowedModels.length === 0
    ? policy.provider === "mock"
    : policy.allowedModels.includes(model);
}
