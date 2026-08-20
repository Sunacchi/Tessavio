import { afterEach, describe, expect, it, vi } from "vitest";
import { modelPolicy } from "../../src/ai/model-policy";
import { OpenRouterAuthAdapter } from "../../src/infrastructure/ai/openrouter-auth-adapter";
import { OpenRouterProvider } from "../../src/infrastructure/ai/openrouter-adapter";
import { AppError } from "../../src/shared/errors";
import { FakeClock } from "../helpers";

const baseUrl = "https://provider.test";

interface RecordedCall {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

function stubFetch(handler: (call: RecordedCall) => Response): {
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    (input: URL | Request | string, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        (init?.headers ?? {}) as Record<string, string>,
      )) {
        headers[key.toLowerCase()] = value;
      }
      const call: RecordedCall = {
        url: input instanceof Request ? input.url : input.toString(),
        headers,
        body:
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as unknown)
            : null,
      };
      calls.push(call);
      return Promise.resolve(handler(call));
    },
  );
  return { calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const policy = modelPolicy({
  provider: "openrouter",
  model: "openai/gpt-4.1-mini",
  maxCostMicrosPerOperation: 5_000,
  dailyBudgetMicrosPerUser: 500_000,
});

function providerRequest(apiKey: string | null) {
  return {
    context: {
      messageText: "ricordami di chiamare il dentista domani alle 9",
      timeZone: "Europe/Rome",
      localDate: "2026-08-20",
      enabledActions: ["reminders.create"] as const,
    },
    schema: { type: "object" },
    model: "openai/gpt-4.1-mini",
    apiKey,
    correlationId: "corr-1",
    maxCostMicros: 5_000,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("C2.3 adapter OpenRouter", () => {
  it("costruisce l'URL di autorizzazione con PKCE S256", () => {
    const adapter = new OpenRouterAuthAdapter(baseUrl, 1_000);
    const url = new URL(
      adapter.authorizeUrl({
        callbackUrl: "https://tessavio.test/ai/oauth/callback/ais_x",
        codeChallenge: "challenge",
      }),
    );
    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("callback_url")).toBe(
      "https://tessavio.test/ai/oauth/callback/ais_x",
    );
    expect(url.searchParams.get("code_verifier")).toBeNull();
  });

  it("scambia il codice nel body senza trasformarlo in bearer", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse({ key: "sk-or-v1-abc", user_id: "acct" }),
    );
    const adapter = new OpenRouterAuthAdapter(baseUrl, 1_000);
    await expect(
      adapter.exchange({
        code: "codice",
        codeVerifier: "verifier",
        correlationId: "corr-1",
      }),
    ).resolves.toEqual({
      outcome: "linked",
      apiKey: "sk-or-v1-abc",
      label: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      code: "codice",
      code_verifier: "verifier",
      code_challenge_method: "S256",
    });
  });

  it("non manda mai il code_verifier nell'URL", async () => {
    const { calls } = stubFetch(() => jsonResponse({ key: "sk-or-v1-abc" }));
    const adapter = new OpenRouterAuthAdapter(baseUrl, 1_000);
    await adapter.exchange({
      code: "codice",
      codeVerifier: "verifier-segreto",
      correlationId: "corr-1",
    });
    expect(calls[0]?.url).not.toContain("verifier-segreto");
  });

  it("legge il credito residuo sia in forma annidata sia piatta", async () => {
    stubFetch(() =>
      jsonResponse({ data: { limit_remaining: 0.25, is_free_tier: false } }),
    );
    const adapter = new OpenRouterAuthAdapter(baseUrl, 1_000);
    await expect(
      adapter.inspect({ apiKey: "sk", correlationId: "corr-1" }),
    ).resolves.toEqual({ limitRemainingMicros: 250_000, isFreeTier: false });

    vi.unstubAllGlobals();
    stubFetch(() =>
      jsonResponse({ limit_remaining: null, is_free_tier: true }),
    );
    await expect(
      adapter.inspect({ apiKey: "sk", correlationId: "corr-1" }),
    ).resolves.toEqual({ limitRemainingMicros: null, isFreeTier: true });
  });

  it("manda schema strict, privacy deny e tetto di costo nella richiesta", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse({
        choices: [{ message: { content: '{"schema_version":"c1.v1"}' } }],
        usage: { cost: 0.001234 },
      }),
    );
    const provider = new OpenRouterProvider(
      baseUrl,
      1_000,
      policy,
      new FakeClock(),
    );
    const result = await provider.propose(providerRequest("sk-or-v1-abc"));

    const body = calls[0]?.body as {
      readonly provider: {
        readonly data_collection: string;
        readonly zdr: boolean;
        readonly require_parameters: boolean;
        readonly max_price: {
          readonly prompt: number;
          readonly completion: number;
        };
      };
      readonly response_format: {
        readonly json_schema: { readonly strict: boolean };
      };
      readonly max_tokens: number;
    };
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider.data_collection).toBe("deny");
    expect(body.provider.zdr).toBe(true);
    expect(body.provider.require_parameters).toBe(true);
    expect(body.provider.max_price).toEqual({
      prompt: 0.4,
      completion: 1.6,
    });
    expect(body.max_tokens).toBeGreaterThanOrEqual(128);
    expect(body.max_tokens).toBeLessThanOrEqual(512);
    expect(calls[0]?.headers.authorization).toBe("Bearer sk-or-v1-abc");
    expect(result.outcome).toBe("completed");
    if (result.outcome !== "completed") throw new Error("esito inatteso");
    expect(result.costMicros).toBe(1_234);
    expect(result.rawJson).toBe('{"schema_version":"c1.v1"}');
  });

  it("non chiama il provider quando il tetto totale non copre prompt e output", async () => {
    const { calls } = stubFetch(() => jsonResponse({}));
    const provider = new OpenRouterProvider(
      baseUrl,
      1_000,
      policy,
      new FakeClock(),
    );
    await expect(
      provider.propose({
        ...providerRequest("sk"),
        maxCostMicros: 1,
      }),
    ).resolves.toEqual({ outcome: "cost_limit" });
    expect(calls).toHaveLength(0);
  });

  it("arrotonda il costo verso l'alto e rifiuta risposte senza costo", async () => {
    stubFetch(() =>
      jsonResponse({
        choices: [{ message: { content: "{}" } }],
        usage: { cost: 0.0000001 },
      }),
    );
    const provider = new OpenRouterProvider(
      baseUrl,
      1_000,
      policy,
      new FakeClock(),
    );
    const priced = await provider.propose(providerRequest("sk"));
    expect(priced.outcome).toBe("completed");
    if (priced.outcome !== "completed") throw new Error("esito inatteso");
    expect(priced.costMicros).toBe(1);

    vi.unstubAllGlobals();
    stubFetch(() =>
      jsonResponse({ choices: [{ message: { content: "{}" } }] }),
    );
    await expect(provider.propose(providerRequest("sk"))).rejects.toEqual(
      new AppError("AMBIGUOUS_EXTERNAL", false),
    );
  });

  it("rifiuta un modello fuori allowlist prima della rete", async () => {
    const { calls } = stubFetch(() => jsonResponse({}));
    const provider = new OpenRouterProvider(
      baseUrl,
      1_000,
      policy,
      new FakeClock(),
    );
    await expect(
      provider.propose({
        ...providerRequest("sk"),
        model: "openrouter/auto",
      }),
    ).rejects.toEqual(new AppError("INVALID_INPUT", false));
    expect(calls).toHaveLength(0);
  });

  it("non chiama il provider senza credenziale", async () => {
    stubFetch(() => jsonResponse({}));
    const provider = new OpenRouterProvider(
      baseUrl,
      1_000,
      policy,
      new FakeClock(),
    );
    await expect(provider.propose(providerRequest(null))).rejects.toEqual(
      new AppError("UNAUTHORIZED", false),
    );
  });

  it("classifica 402 come permanente e 429 come ritentabile", async () => {
    stubFetch(() => jsonResponse({ error: "no credit" }, 402));
    const provider = new OpenRouterProvider(
      baseUrl,
      1_000,
      policy,
      new FakeClock(),
    );
    await expect(provider.propose(providerRequest("sk"))).rejects.toEqual(
      new AppError("PERMANENT_EXTERNAL", false),
    );

    vi.unstubAllGlobals();
    stubFetch(() => jsonResponse({ error: "slow down" }, 429));
    await expect(provider.propose(providerRequest("sk"))).rejects.toEqual(
      new AppError("RETRYABLE_EXTERNAL", true),
    );
  });

  it("apre l'interruttore dopo fallimenti ripetuti", async () => {
    const { calls } = stubFetch(() => jsonResponse({ error: "boom" }, 500));
    const clock = new FakeClock();
    const provider = new OpenRouterProvider(baseUrl, 1_000, policy, clock);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(provider.propose(providerRequest("sk"))).rejects.toThrow();
    }
    const attempted = calls.length;
    await expect(provider.propose(providerRequest("sk"))).rejects.toEqual(
      new AppError("RETRYABLE_EXTERNAL", true),
    );
    expect(calls.length).toBe(attempted);
  });
});
