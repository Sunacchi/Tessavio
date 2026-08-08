import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleTelegramWebhook } from "../../src/entrypoints/webhook";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import { D1IngressLimiter } from "../../src/infrastructure/db/ingress-limiter";
import {
  FakeClock,
  SequenceIds,
  telegramStartUpdate,
  testConfig,
  webhookRequest,
} from "../helpers";

class NoopQueue implements Queue {
  readonly messages: unknown[] = [];

  metrics(): Promise<QueueMetrics> {
    return Promise.resolve({ backlogCount: 0, backlogBytes: 0 });
  }

  send(message: unknown): Promise<QueueSendResponse> {
    this.messages.push(message);
    return Promise.resolve({
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    });
  }

  sendBatch(
    messages: Iterable<MessageSendRequest>,
  ): Promise<QueueSendBatchResponse> {
    for (const message of messages) {
      this.messages.push(message.body);
    }
    return Promise.resolve({
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    });
  }
}

function makeEnv(queue: Queue = new NoopQueue()): Env {
  return {
    ...env,
    INBOUND_QUEUE: queue,
    TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
  };
}

describe("webhook security", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare("DELETE FROM ingress_rate_limits"),
      env.DB.prepare("DELETE FROM webhook_concurrency_leases"),
    ]);
  });

  it("rejects a wrong secret without logging secret or payload", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const response = await handleTelegramWebhook(
      webhookRequest(telegramStartUpdate(301), "wrong-secret", "192.0.2.40"),
      makeEnv(),
      testConfig,
      { clock: new FakeClock(), ids: new SequenceIds() },
    );

    expect(response.status).toBe(401);
    const logs = warning.mock.calls.flat().join(" ");
    expect(logs).not.toContain("wrong-secret");
    expect(logs).not.toContain("/start");
    expect(logs).not.toContain("never_persist_this");
    warning.mockRestore();
  });

  it("rejects invalid and oversized payloads before enqueue", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const workerEnv = makeEnv();
    const invalid = await handleTelegramWebhook(
      webhookRequest(
        '{"update_id":"not-an-integer","text":"private-content"}',
        undefined,
        "192.0.2.41",
      ),
      workerEnv,
      testConfig,
      { clock: new FakeClock(), ids: new SequenceIds() },
    );
    expect(invalid.status).toBe(400);
    expect(warning.mock.calls.flat().join(" ")).not.toContain(
      "private-content",
    );

    const oversized = new Request("https://example.test/telegram/webhook", {
      method: "POST",
      headers: {
        "content-length": String(testConfig.WEBHOOK_MAX_BODY_BYTES + 1),
        "x-telegram-bot-api-secret-token": "test-webhook-secret",
      },
      body: "{}",
    });
    const oversizedResponse = await handleTelegramWebhook(
      oversized,
      workerEnv,
      testConfig,
      { clock: new FakeClock(), ids: new SequenceIds() },
    );
    expect(oversizedResponse.status).toBe(413);
    warning.mockRestore();
  });

  it("accepts only POST on the exact webhook path", async () => {
    const workerEnv = makeEnv();
    const getResponse = await handleTelegramWebhook(
      new Request("https://example.test/telegram/webhook"),
      workerEnv,
      testConfig,
      { clock: new FakeClock(), ids: new SequenceIds() },
    );
    const wrongPath = await handleTelegramWebhook(
      new Request("https://example.test/other", { method: "POST", body: "{}" }),
      workerEnv,
      testConfig,
      { clock: new FakeClock(), ids: new SequenceIds() },
    );
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST");
    expect(wrongPath.status).toBe(404);
  });

  it("acknowledges a poison envelope without logging its contents", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const batch = createMessageBatch("tessavio-inbound-dev", [
      {
        id: "poison-message",
        timestamp: new Date("2026-08-08T08:00:00.000Z"),
        attempts: 1,
        body: { malformed: "private-poison-content" },
      },
    ]);
    await handleInboundQueue(batch, makeEnv());

    expect(warning.mock.calls.flat().join(" ")).not.toContain(
      "private-poison-content",
    );
    warning.mockRestore();
  });

  it("rejects a forged replay without changing the legitimate inbox", async () => {
    const queue = new NoopQueue();
    const workerEnv = makeEnv(queue);
    await handleTelegramWebhook(
      webhookRequest(
        telegramStartUpdate(304, 4004),
        "test-webhook-secret",
        "192.0.2.43",
      ),
      workerEnv,
      testConfig,
      { clock: new FakeClock(), ids: new SequenceIds() },
    );
    const legitimate = queue.messages[0] as InboundMessageEnvelope;
    const legitimateMessage = legitimate.payload.message;
    if (legitimateMessage === undefined) {
      throw new Error("expected a normalized message fixture");
    }
    const forged: InboundMessageEnvelope = {
      ...legitimate,
      payload: {
        ...legitimate.payload,
        message: {
          ...legitimateMessage,
          chat: { ...legitimateMessage.chat, id: -999_999 },
        },
      },
    };
    const batch = createMessageBatch("tessavio-inbound-dev", [
      { id: "forged-replay", timestamp: new Date(), attempts: 1, body: forged },
    ]);
    await handleInboundQueue(batch, workerEnv);

    const row = await env.DB.prepare(
      "SELECT status FROM inbound_updates WHERE update_id = ?",
    )
      .bind(304)
      .first<{ status: string }>();
    expect(row?.status).toBe("enqueued");
    const users = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users",
    ).first<{
      count: number;
    }>();
    expect(users?.count).toBe(0);
  });

  it("enforces durable rate and concurrency limits", async () => {
    const clock = new FakeClock();
    const limitedConfig = { ...testConfig, WEBHOOK_RATE_LIMIT_MAX: 1 };
    const workerEnv = makeEnv();
    const first = await handleTelegramWebhook(
      webhookRequest(
        telegramStartUpdate(302),
        "test-webhook-secret",
        "192.0.2.42",
      ),
      workerEnv,
      limitedConfig,
      { clock, ids: new SequenceIds() },
    );
    const second = await handleTelegramWebhook(
      webhookRequest(
        telegramStartUpdate(303),
        "test-webhook-secret",
        "192.0.2.42",
      ),
      workerEnv,
      limitedConfig,
      { clock, ids: new SequenceIds() },
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);

    const limiter = new D1IngressLimiter(env.DB);
    await expect(
      limiter.acquireConcurrency("lease-a", clock.now(), 30, 1),
    ).resolves.toBe(true);
    await expect(
      limiter.acquireConcurrency("lease-b", clock.now(), 30, 1),
    ).resolves.toBe(false);
    await limiter.releaseConcurrency("lease-a");
  });
});
