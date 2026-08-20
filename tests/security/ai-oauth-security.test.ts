import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeAiLink,
  startAiLink,
} from "../../src/application/link-ai-credential";
import type {
  AiAuthorizationExchange,
  AiAuthorizationPort,
} from "../../src/application/ports/ai-credentials";
import type { TelegramReplyPort } from "../../src/application/ports/telegram";
import { handleRequest } from "../../src/entrypoints/router";
import { importKek, type KekRing } from "../../src/security/credential-crypto";
import { codeChallengeOf } from "../../src/security/pkce";
import { createAiTestRuntime } from "../ai-helpers";
import { FakeClock, SequenceIds, testConfig } from "../helpers";

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];

  send(_chatId: number | string, text: string): Promise<{ messageId: string }> {
    this.texts.push(text);
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

/**
 * Server OAuth **fake**: verifica il PKCE come farebbe il provider reale e
 * conta gli scambi. Nessuna rete, nessuna credenziale vera (gate G0.2).
 */
class FakeOauthServer implements AiAuthorizationPort {
  exchanges = 0;
  readonly issued = new Map<string, string>();

  constructor(private readonly expectedChallenge: () => Promise<string>) {}

  authorizeUrl(): string {
    return "https://provider.test/auth?callback_url=x";
  }

  async exchange(input: {
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<AiAuthorizationExchange> {
    this.exchanges += 1;
    const challenge = await codeChallengeOf(input.codeVerifier);
    if (challenge !== (await this.expectedChallenge())) {
      return { outcome: "rejected" };
    }
    if (input.code !== "codice-valido") return { outcome: "rejected" };
    const key = `sk-or-v1-${String(this.exchanges)}`;
    this.issued.set(input.codeVerifier, key);
    return { outcome: "linked", apiKey: key, label: null };
  }
}

const publicBaseUrl = "https://tessavio.test";

async function kekRing(): Promise<KekRing> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return { current: await importKek(btoa(binary), 1), previous: [] };
}

function callbackRequest(sessionId: string, code = "codice-valido"): Request {
  return new Request(
    `${publicBaseUrl}/ai/oauth/callback/${sessionId}?code=${code}`,
    { headers: { "cf-connecting-ip": "192.0.2.44" } },
  );
}

async function seedUser(userId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, status, created_at) VALUES (?, 'active', ?)",
  )
    .bind(userId, Date.now())
    .run();
}

describe("C2.1 sessione OAuth e callback", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ai_credentials"),
      env.DB.prepare("DELETE FROM ai_oauth_sessions"),
      env.DB.prepare("DELETE FROM ingress_rate_limits"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  async function runtimeWith(server: AiAuthorizationPort, clock: FakeClock) {
    const reply = new CapturingReply();
    const runtime = createAiTestRuntime(env.DB, {
      clock,
      ids: new SequenceIds(),
      reply,
      kek: await kekRing(),
      authorization: server,
      publicBaseUrl,
    });
    return { runtime, reply };
  }

  it("collega la chiave e la cifra, senza farla passare da Telegram", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    await seedUser("user-a");
    let challenge = "";
    const server = new FakeOauthServer(() => Promise.resolve(challenge));
    const { runtime, reply } = await runtimeWith(server, clock);

    const message = await startAiLink(
      {
        actorUserId: "user-a",
        scope: { userId: "user-a" },
        chatId: 5_001,
        correlationId: "corr-link",
        idempotencyKey: "idem-link",
        jobId: "job-link",
        sentAtUnix: 1_786_173_600,
      },
      runtime.link,
    );
    expect(message).toContain(`${publicBaseUrl}/ai/oauth/start/ais_`);
    const sessionId = /start\/(ais_[A-Za-z0-9-]+)/u.exec(message)?.[1] ?? "";
    const stored = await env.DB.prepare(
      "SELECT code_challenge, code_verifier, status FROM ai_oauth_sessions WHERE session_id = ?",
    )
      .bind(sessionId)
      .first<{
        code_challenge: string;
        code_verifier: string;
        status: string;
      }>();
    challenge = stored?.code_challenge ?? "";
    expect(stored?.status).toBe("pending");
    expect(message).not.toContain(stored?.code_verifier ?? "impossibile");

    const response = await handleRequest(
      callbackRequest(sessionId),
      env,
      testConfig,
      { clock, link: runtime.link, publicBaseUrl, reply },
    );
    expect(response.status).toBe(200);
    expect(reply.texts[reply.texts.length - 1]).toContain("collegata");

    const credential = await env.DB.prepare(
      "SELECT status, ciphertext, kek_version FROM ai_credentials WHERE user_id = 'user-a'",
    ).first<{ status: string; ciphertext: string; kek_version: number }>();
    expect(credential?.status).toBe("active");
    expect(credential?.ciphertext).not.toContain("sk-or-v1");
    expect(credential?.kek_version).toBe(1);
  });

  it("rifiuta il replay del codice: la sessione è single-use", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    await seedUser("user-a");
    let challenge = "";
    const server = new FakeOauthServer(() => Promise.resolve(challenge));
    const { runtime, reply } = await runtimeWith(server, clock);
    const message = await startAiLink(
      {
        actorUserId: "user-a",
        scope: { userId: "user-a" },
        chatId: 5_001,
        correlationId: "corr-replay",
        idempotencyKey: "idem-replay",
        jobId: "job-replay",
        sentAtUnix: 1_786_173_600,
      },
      runtime.link,
    );
    const sessionId = /start\/(ais_[A-Za-z0-9-]+)/u.exec(message)?.[1] ?? "";
    challenge =
      (
        await env.DB.prepare(
          "SELECT code_challenge FROM ai_oauth_sessions WHERE session_id = ?",
        )
          .bind(sessionId)
          .first<{ code_challenge: string }>()
      )?.code_challenge ?? "";

    const first = await handleRequest(
      callbackRequest(sessionId),
      env,
      testConfig,
      {
        clock,
        link: runtime.link,
        publicBaseUrl,
        reply,
      },
    );
    const second = await handleRequest(
      callbackRequest(sessionId),
      env,
      testConfig,
      {
        clock,
        link: runtime.link,
        publicBaseUrl,
        reply,
      },
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(server.exchanges).toBe(1);
  });

  it("non distingue una sessione inesistente da una scaduta", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    await seedUser("user-a");
    const server = new FakeOauthServer(() => Promise.resolve("mai"));
    const { runtime, reply } = await runtimeWith(server, clock);
    const message = await startAiLink(
      {
        actorUserId: "user-a",
        scope: { userId: "user-a" },
        chatId: 5_001,
        correlationId: "corr-scaduta",
        idempotencyKey: "idem-scaduta",
        jobId: "job-scaduta",
        sentAtUnix: 1_786_173_600,
      },
      runtime.link,
    );
    const sessionId = /start\/(ais_[A-Za-z0-9-]+)/u.exec(message)?.[1] ?? "";
    clock.advance(11 * 60 * 1_000);

    const expired = await handleRequest(
      callbackRequest(sessionId),
      env,
      testConfig,
      {
        clock,
        link: runtime.link,
        publicBaseUrl,
        reply,
      },
    );
    const missing = await handleRequest(
      callbackRequest("ais_00000000-0000-4000-8000-999999999999"),
      env,
      testConfig,
      { clock, link: runtime.link, publicBaseUrl, reply },
    );
    expect(expired.status).toBe(missing.status);
    expect(await expired.text()).toBe(await missing.text());
    expect(server.exchanges).toBe(0);
  });

  it("rifiuta un PKCE che non corrisponde", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    await seedUser("user-a");
    const server = new FakeOauthServer(() =>
      Promise.resolve("challenge-di-un-altro"),
    );
    const { runtime, reply } = await runtimeWith(server, clock);
    const message = await startAiLink(
      {
        actorUserId: "user-a",
        scope: { userId: "user-a" },
        chatId: 5_001,
        correlationId: "corr-pkce",
        idempotencyKey: "idem-pkce",
        jobId: "job-pkce",
        sentAtUnix: 1_786_173_600,
      },
      runtime.link,
    );
    const sessionId = /start\/(ais_[A-Za-z0-9-]+)/u.exec(message)?.[1] ?? "";
    const response = await handleRequest(
      callbackRequest(sessionId),
      env,
      testConfig,
      {
        clock,
        link: runtime.link,
        publicBaseUrl,
        reply,
      },
    );
    expect(response.status).toBe(400);
    await expect(
      env.DB.prepare("SELECT COUNT(*) AS total FROM ai_credentials").first<{
        total: number;
      }>(),
    ).resolves.toEqual({ total: 0 });
  });

  it("due callback concorrenti producono una sola chiave", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    await seedUser("user-a");
    let challenge = "";
    const server = new FakeOauthServer(() => Promise.resolve(challenge));
    const { runtime } = await runtimeWith(server, clock);
    const message = await startAiLink(
      {
        actorUserId: "user-a",
        scope: { userId: "user-a" },
        chatId: 5_001,
        correlationId: "corr-race",
        idempotencyKey: "idem-race",
        jobId: "job-race",
        sentAtUnix: 1_786_173_600,
      },
      runtime.link,
    );
    const sessionId = /start\/(ais_[A-Za-z0-9-]+)/u.exec(message)?.[1] ?? "";
    challenge =
      (
        await env.DB.prepare(
          "SELECT code_challenge FROM ai_oauth_sessions WHERE session_id = ?",
        )
          .bind(sessionId)
          .first<{ code_challenge: string }>()
      )?.code_challenge ?? "";

    const [first, second] = await Promise.all([
      completeAiLink({ sessionId, code: "codice-valido" }, runtime.link),
      completeAiLink({ sessionId, code: "codice-valido" }, runtime.link),
    ]);
    const linked = [first, second].filter(
      (outcome) => outcome.outcome === "linked",
    );
    expect(linked).toHaveLength(1);
    expect(server.exchanges).toBe(1);
  });

  it("accetta il callback solo sull'host in allowlist", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    await seedUser("user-a");
    const server = new FakeOauthServer(() => Promise.resolve("x"));
    const { runtime, reply } = await runtimeWith(server, clock);
    const response = await handleRequest(
      new Request(
        "https://impostore.test/ai/oauth/callback/ais_abcdefghijklmnop?code=x",
        {
          headers: { "cf-connecting-ip": "192.0.2.45" },
        },
      ),
      env,
      testConfig,
      { clock, link: runtime.link, publicBaseUrl, reply },
    );
    expect(response.status).toBe(400);
    expect(server.exchanges).toBe(0);
  });

  it("applica il rate limit alla nuova superficie pubblica", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    const server = new FakeOauthServer(() => Promise.resolve("x"));
    const { runtime, reply } = await runtimeWith(server, clock);
    const limitedConfig = {
      ...testConfig,
      WEBHOOK_RATE_LIMIT_MAX: 2,
    };
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await handleRequest(
        callbackRequest("ais_00000000-0000-4000-8000-000000000001"),
        env,
        limitedConfig,
        { clock, link: runtime.link, publicBaseUrl, reply },
      );
      statuses.push(response.status);
    }
    expect(statuses[2]).toBe(429);
  });

  it("scollega cancellando il testo cifrato", async () => {
    const clock = new FakeClock(new Date("2026-08-20T08:00:00Z"));
    await seedUser("user-a");
    let challenge = "";
    const server = new FakeOauthServer(() => Promise.resolve(challenge));
    const { runtime, reply } = await runtimeWith(server, clock);
    const message = await startAiLink(
      {
        actorUserId: "user-a",
        scope: { userId: "user-a" },
        chatId: 5_001,
        correlationId: "corr-revoke",
        idempotencyKey: "idem-revoke",
        jobId: "job-revoke",
        sentAtUnix: 1_786_173_600,
      },
      runtime.link,
    );
    const sessionId = /start\/(ais_[A-Za-z0-9-]+)/u.exec(message)?.[1] ?? "";
    challenge =
      (
        await env.DB.prepare(
          "SELECT code_challenge FROM ai_oauth_sessions WHERE session_id = ?",
        )
          .bind(sessionId)
          .first<{ code_challenge: string }>()
      )?.code_challenge ?? "";
    await handleRequest(callbackRequest(sessionId), env, testConfig, {
      clock,
      link: runtime.link,
      publicBaseUrl,
      reply,
    });

    const { revokeAiCredential } =
      await import("../../src/application/link-ai-credential");
    const revoked = await revokeAiCredential(
      {
        actorUserId: "user-a",
        scope: { userId: "user-a" },
        chatId: 5_001,
        correlationId: "corr-revoke-2",
        idempotencyKey: "idem-revoke-2",
        jobId: "job-revoke-2",
        sentAtUnix: 1_786_173_600,
      },
      runtime.link,
    );
    expect(revoked).toContain("scollegata");
    const row = await env.DB.prepare(
      "SELECT status, ciphertext FROM ai_credentials WHERE user_id = 'user-a'",
    ).first<{ status: string; ciphertext: string }>();
    expect(row).toEqual({ status: "revoked", ciphertext: "" });
  });
});
