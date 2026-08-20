import { z } from "zod";
import type {
  AiAuthorizationExchange,
  AiAuthorizationPort,
  AiAuthorizationRequest,
  AiKeyInspectionPort,
  AiKeyStatus,
} from "../../application/ports/ai-credentials";
import { logEvent } from "../../shared/logger";

const exchangeResponseSchema = z.object({
  key: z.string().min(1),
  user_id: z.string().optional(),
});

const keyResponseSchema = z.object({
  data: z
    .object({
      label: z.string().nullish(),
      limit_remaining: z.number().nullish(),
      is_free_tier: z.boolean().nullish(),
    })
    .optional(),
  label: z.string().nullish(),
  limit_remaining: z.number().nullish(),
  is_free_tier: z.boolean().nullish(),
});

async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await run(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Adapter OAuth PKCE conforme al flusso body-only documentato da OpenRouter. */
export class OpenRouterAuthAdapter
  implements AiAuthorizationPort, AiKeyInspectionPort
{
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  authorizeUrl(request: AiAuthorizationRequest): string {
    const url = new URL("/auth", this.baseUrl);
    url.searchParams.set("callback_url", request.callbackUrl);
    url.searchParams.set("code_challenge", request.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async exchange(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly correlationId: string;
  }): Promise<AiAuthorizationExchange> {
    return this.postKeys(input);
  }

  private async postKeys(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly correlationId: string;
  }): Promise<AiAuthorizationExchange> {
    const response = await withTimeout(this.timeoutMs, (signal) =>
      fetch(new URL("/api/v1/auth/keys", this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          code: input.code,
          code_verifier: input.codeVerifier,
          code_challenge_method: "S256",
        }),
      }),
    );
    if (response === null) {
      logEvent("warn", "ai.oauth_exchange_unavailable", {
        correlationId: input.correlationId,
        errorCode: "RETRYABLE_EXTERNAL",
      });
      return { outcome: "unavailable" };
    }
    if (!response.ok) {
      logEvent("warn", "ai.oauth_exchange_rejected", {
        correlationId: input.correlationId,
        state: String(response.status),
      });
      return response.status >= 500
        ? { outcome: "unavailable" }
        : { outcome: "rejected" };
    }
    const parsed = exchangeResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { outcome: "rejected" };
    return { outcome: "linked", apiKey: parsed.data.key, label: null };
  }

  async inspect(input: {
    readonly apiKey: string;
    readonly correlationId: string;
  }): Promise<AiKeyStatus | null> {
    const response = await withTimeout(this.timeoutMs, (signal) =>
      fetch(new URL("/api/v1/key", this.baseUrl), {
        headers: { authorization: `Bearer ${input.apiKey}` },
        signal,
      }),
    );
    if (!response?.ok) return null;
    const parsed = keyResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const data = parsed.data.data ?? parsed.data;
    const remaining = data.limit_remaining;
    return {
      limitRemainingMicros:
        remaining === null || remaining === undefined
          ? null
          : Math.trunc(remaining * 1_000_000),
      isFreeTier: data.is_free_tier === true,
    };
  }
}
