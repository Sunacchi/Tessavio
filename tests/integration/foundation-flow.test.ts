import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import type { TelegramReplyPort } from "../../src/application/ports";
import { processInboundMessage } from "../../src/application/process-inbound";
import { handleTelegramWebhook } from "../../src/entrypoints/webhook";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import { recoverPendingInboxes } from "../../src/entrypoints/scheduled";
import { D1DeliveryRepository } from "../../src/infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../../src/infrastructure/db/effect-repository";
import { D1IdentityRepository } from "../../src/infrastructure/db/identity-repository";
import { D1InboundRepository } from "../../src/infrastructure/db/inbound-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { AppError } from "../../src/shared/errors";
import {
  FakeClock,
  SequenceIds,
  telegramStartUpdate,
  testConfig,
  webhookRequest,
} from "../helpers";

class CapturingQueue implements Queue {
  readonly messages: unknown[] = [];
  failNext = false;

  metrics(): Promise<QueueMetrics> {
    return Promise.resolve({
      backlogCount: this.messages.length,
      backlogBytes: 0,
    });
  }

  send(message: unknown): Promise<QueueSendResponse> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("injected queue failure"));
    }
    this.messages.push(message);
    return Promise.resolve({
      metadata: {
        metrics: { backlogCount: this.messages.length, backlogBytes: 0 },
      },
    });
  }

  sendBatch(
    messages: Iterable<MessageSendRequest>,
  ): Promise<QueueSendBatchResponse> {
    for (const message of messages) {
      this.messages.push(message.body);
    }
    return Promise.resolve({
      metadata: {
        metrics: { backlogCount: this.messages.length, backlogBytes: 0 },
      },
    });
  }
}

class FakeReply implements TelegramReplyPort {
  calls = 0;
  ambiguous = false;

  send(): Promise<{ readonly messageId: string }> {
    this.calls += 1;
    if (this.ambiguous) {
      return Promise.reject(new AppError("RETRYABLE_EXTERNAL", true));
    }
    return Promise.resolve({ messageId: "9001" });
  }
}

function makeEnv(queue: Queue): Env {
  return {
    ...env,
    INBOUND_QUEUE: queue,
    TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
  };
}

function processDependencies(
  clock: FakeClock,
  ids: SequenceIds,
  reply: FakeReply,
) {
  return {
    authorizer: new SelfScopeAuthorizer(),
    clock,
    deliveries: new D1DeliveryRepository(env.DB),
    effects: new D1EffectRepository(env.DB),
    identities: new D1IdentityRepository(env.DB),
    ids,
    inbox: new D1InboundRepository(env.DB),
    reply,
    leaseSeconds: 60,
  };
}

async function count(table: string): Promise<number> {
  const allowed = new Set([
    "users",
    "telegram_identities",
    "effects",
    "deliveries",
    "audit_log",
  ]);
  if (!allowed.has(table)) {
    throw new Error("invalid test table");
  }
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM ${table}`,
  ).first<{
    count: number;
  }>();
  return row?.count ?? 0;
}

describe("webhook -> inbox -> queue envelope -> deterministic /start", () => {
  let clock: FakeClock;
  let ids: SequenceIds;

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
    clock = new FakeClock();
    ids = new SequenceIds();
  });

  it("executes one logical effect and one reply across physical duplicates", async () => {
    const queue = new CapturingQueue();
    const workerEnv = makeEnv(queue);
    const request = webhookRequest(telegramStartUpdate(201, 3001));
    const response = await handleTelegramWebhook(
      request,
      workerEnv,
      testConfig,
      { clock, ids },
    );
    expect(response.status).toBe(200);
    expect(queue.messages).toHaveLength(1);

    const duplicateResponse = await handleTelegramWebhook(
      webhookRequest(
        telegramStartUpdate(201, 3001),
        "test-webhook-secret",
        "192.0.2.11",
      ),
      workerEnv,
      testConfig,
      { clock, ids },
    );
    expect(duplicateResponse.status).toBe(200);
    expect(queue.messages).toHaveLength(2);
    expect(queue.messages[1]).toEqual(queue.messages[0]);

    const envelope = queue.messages[0] as InboundMessageEnvelope;
    const reply = new FakeReply();
    const dependencies = processDependencies(clock, ids, reply);
    await expect(
      processInboundMessage(envelope, dependencies),
    ).resolves.toEqual({
      outcome: "completed",
    });
    await expect(
      processInboundMessage(envelope, dependencies),
    ).resolves.toEqual({
      outcome: "duplicate",
    });

    expect(reply.calls).toBe(1);
    await expect(count("users")).resolves.toBe(1);
    await expect(count("telegram_identities")).resolves.toBe(1);
    await expect(count("effects")).resolves.toBe(1);
    await expect(count("deliveries")).resolves.toBe(1);
    await expect(count("audit_log")).resolves.toBe(1);

    const persisted = await env.DB.prepare(
      "SELECT envelope_json FROM inbound_updates WHERE update_id = ?",
    )
      .bind(201)
      .first<{ envelope_json: string }>();
    expect(persisted?.envelope_json).not.toContain("never_persist_this");
  });

  it("recovers a D1-committed inbox after enqueue failure", async () => {
    const queue = new CapturingQueue();
    queue.failNext = true;
    const workerEnv = makeEnv(queue);

    const first = await handleTelegramWebhook(
      webhookRequest(
        telegramStartUpdate(202, 3002),
        "test-webhook-secret",
        "192.0.2.20",
      ),
      workerEnv,
      testConfig,
      { clock, ids },
    );
    expect(first.status).toBe(503);
    const stored = await env.DB.prepare(
      "SELECT job_id, correlation_id, status FROM inbound_updates WHERE update_id = ?",
    )
      .bind(202)
      .first<{ job_id: string; correlation_id: string; status: string }>();
    expect(stored?.status).toBe("pending_enqueue");

    clock.advance(31_000);
    await recoverPendingInboxes(workerEnv, testConfig, clock);
    const recovered = queue.messages[0] as InboundMessageEnvelope;
    expect(recovered.jobId).toBe(stored?.job_id);
    expect(recovered.correlationId).toBe(stored?.correlation_id);
    const after = await env.DB.prepare(
      "SELECT status FROM inbound_updates WHERE update_id = ?",
    )
      .bind(202)
      .first<{ status: string }>();
    expect(after?.status).toBe("enqueued");
  });

  it("does not retry an ambiguous Telegram send", async () => {
    const queue = new CapturingQueue();
    await handleTelegramWebhook(
      webhookRequest(
        telegramStartUpdate(203, 3003),
        "test-webhook-secret",
        "192.0.2.30",
      ),
      makeEnv(queue),
      testConfig,
      { clock, ids },
    );
    const envelope = queue.messages[0] as InboundMessageEnvelope;
    const reply = new FakeReply();
    reply.ambiguous = true;
    const dependencies = processDependencies(clock, ids, reply);

    await expect(
      processInboundMessage(envelope, dependencies),
    ).resolves.toEqual({
      outcome: "ambiguous",
    });
    await expect(
      processInboundMessage(envelope, dependencies),
    ).resolves.toEqual({
      outcome: "duplicate",
    });
    expect(reply.calls).toBe(1);
    const row = await env.DB.prepare(
      "SELECT status FROM deliveries WHERE job_id = ?",
    )
      .bind(envelope.jobId)
      .first<{ status: string }>();
    expect(row?.status).toBe("ambiguous");
  });

  it("keeps the active inbox lease when a physical duplicate arrives", async () => {
    const queue = new CapturingQueue();
    const workerEnv = makeEnv(queue);
    await handleTelegramWebhook(
      webhookRequest(
        telegramStartUpdate(204, 3004),
        "test-webhook-secret",
        "192.0.2.31",
      ),
      workerEnv,
      testConfig,
      { clock, ids },
    );
    const envelope = queue.messages[0] as InboundMessageEnvelope;
    const inbox = new D1InboundRepository(env.DB);
    await expect(inbox.claim(envelope, clock.now(), 60)).resolves.toBe(
      "claimed",
    );

    const batch = createMessageBatch("tessavio-inbound-dev", [
      {
        id: "physical-duplicate",
        timestamp: clock.now(),
        attempts: 2,
        body: envelope,
      },
    ]);
    await handleInboundQueue(batch, workerEnv);

    const row = await env.DB.prepare(
      "SELECT status FROM inbound_updates WHERE job_id = ?",
    )
      .bind(envelope.jobId)
      .first<{ status: string }>();
    expect(row?.status).toBe("processing");
  });

  it("completes unsupported updates without creating a tenant or reply", async () => {
    const queue = new CapturingQueue();
    await handleTelegramWebhook(
      webhookRequest({ update_id: 205 }, "test-webhook-secret", "192.0.2.32"),
      makeEnv(queue),
      testConfig,
      { clock, ids },
    );
    const envelope = queue.messages[0] as InboundMessageEnvelope;
    const reply = new FakeReply();

    await expect(
      processInboundMessage(envelope, processDependencies(clock, ids, reply)),
    ).resolves.toEqual({ outcome: "unsupported" });
    expect(reply.calls).toBe(0);
    await expect(count("users")).resolves.toBe(0);
  });

  it("requires tenant scope on effect reads", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
    )
      .bind("user-a", clock.now().getTime())
      .run();
    await env.DB.prepare(
      "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
    )
      .bind("user-b", clock.now().getTime())
      .run();
    const effects = new D1EffectRepository(env.DB);
    await effects.claim({ userId: "user-a" }, "effect-a", "job-a", clock.now());

    await expect(
      effects.get({ userId: "user-b" }, "effect-a"),
    ).resolves.toBeNull();
    await expect(effects.get({ userId: "user-a" }, "effect-a")).resolves.toBe(
      "claimed",
    );
  });
});
