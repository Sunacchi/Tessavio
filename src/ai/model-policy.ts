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
  /** Price ceilings in integer micro-USD per one million tokens. */
  readonly pricing: AiModelPricing | null;
  readonly maxCostMicrosPerOperation: number;
  readonly dailyBudgetMicrosPerUser: number;
  readonly enabledActions: readonly AiAction[];
}

export interface AiModelPricing {
  readonly promptMicrosPerMillion: number;
  readonly completionMicrosPerMillion: number;
  readonly maxOutputTokens: number;
}

export const mockModel = "mock/deterministic-v1";

/**
 * Allowlist C2 verificata contro `GET /api/v1/models` il 2026-08-20.
 * I prezzi sono ceiling, non stime del costo totale: OpenRouter interpreta
 * `max_price` in USD per milione di token.
 */
const openRouterModels: Readonly<Record<string, AiModelPricing>> = {
  "openai/gpt-4.1-mini": {
    promptMicrosPerMillion: 400_000,
    completionMicrosPerMillion: 1_600_000,
    maxOutputTokens: 512,
  },
};

export const openRouterAllowlist: readonly string[] =
  Object.keys(openRouterModels);

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
    pricing:
      input.provider === "openrouter"
        ? (openRouterModels[input.model] ?? null)
        : null,
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
