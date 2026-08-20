import { z } from "zod";
import type {
  AiProviderPort,
  AiProviderRequest,
  AiProviderResult,
} from "../../application/ports/ai";
import { buildMessages } from "../../ai/prompt";
import type { AiModelPolicy } from "../../ai/model-policy";
import type { Clock } from "../../shared/contracts";
import { AppError } from "../../shared/errors";
import { logEvent } from "../../shared/logger";
import { CircuitBreaker } from "./circuit-breaker";

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
  usage: z
    .object({
      cost: z.number().nullish(),
    })
    .nullish(),
});

/**
 * Adapter OpenRouter. Il dominio non lo conosce: implementa la porta
 * provider-agnostica. Privacy e routing sono configurazione versionata
 * (ADR-0025), non decisioni prese qui.
 */
export class OpenRouterProvider implements AiProviderPort {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly policy: AiModelPolicy,
    clock: Clock,
    breaker?: CircuitBreaker,
  ) {
    this.breaker = breaker ?? new CircuitBreaker(clock);
  }

  async propose(request: AiProviderRequest): Promise<AiProviderResult> {
    if (request.apiKey === null) throw new AppError("UNAUTHORIZED", false);
    if (!this.breaker.allows()) throw new AppError("RETRYABLE_EXTERNAL", true);

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await fetch(
        new URL("/api/v1/chat/completions", this.baseUrl),
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${request.apiKey}`,
          },
          body: JSON.stringify({
            model: request.model,
            messages: buildMessages(request.context),
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "tessavio_action_proposals",
                strict: true,
                schema: request.schema,
              },
            },
            provider: {
              data_collection: this.policy.dataCollection,
              zdr: this.policy.zeroDataRetention,
              require_parameters: this.policy.requireStructuredOutputs,
              allow_fallbacks: true,
              only:
                this.policy.allowedModels.length > 0
                  ? this.policy.allowedModels.map(
                      (model) => model.split("/")[0],
                    )
                  : undefined,
              max_price: {
                prompt: request.maxCostMicros / 1_000_000,
                completion: request.maxCostMicros / 1_000_000,
              },
            },
          }),
        },
      );

      if (response.status === 402) {
        this.breaker.recordSuccess();
        throw new AppError("PERMANENT_EXTERNAL", false);
      }
      if (response.status === 429 || response.status >= 500) {
        this.breaker.recordFailure();
        throw new AppError("RETRYABLE_EXTERNAL", true);
      }
      if (!response.ok) {
        this.breaker.recordFailure();
        throw new AppError("PERMANENT_EXTERNAL", false);
      }

      const parsed = completionSchema.safeParse(await response.json());
      if (!parsed.success) {
        this.breaker.recordFailure();
        throw new AppError("AMBIGUOUS_EXTERNAL", false);
      }
      this.breaker.recordSuccess();
      const latencyMs = Date.now() - startedAt;
      const costMicros = Math.max(
        0,
        Math.round((parsed.data.usage?.cost ?? 0) * 1_000_000),
      );
      // Nessun prompt e nessuna credenziale nei log (invariante 5).
      logEvent("info", "ai.provider_completed", {
        correlationId: request.correlationId,
        state: request.model,
        latencyMs,
      });
      return {
        rawJson: parsed.data.choices[0]?.message.content ?? "",
        model: request.model,
        costMicros,
        latencyMs,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.breaker.recordFailure();
      logEvent("warn", "ai.provider_failed", {
        correlationId: request.correlationId,
        errorCode: "RETRYABLE_EXTERNAL",
      });
      throw new AppError("RETRYABLE_EXTERNAL", true);
    } finally {
      clearTimeout(timer);
    }
  }
}
