import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import type { PreferenceMutationContext } from "../../src/application/ports/preferences";
import type { TelegramReplyPort } from "../../src/application/ports/telegram";
import { processInboundMessage } from "../../src/application/process-inbound";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import { D1DeliveryRepository } from "../../src/infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../../src/infrastructure/db/effect-repository";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1IdentityRepository } from "../../src/infrastructure/db/identity-repository";
import { D1InboundRepository } from "../../src/infrastructure/db/inbound-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1ReminderRepository } from "../../src/infrastructure/db/reminder-repository";
import { D1TaskRepository } from "../../src/infrastructure/db/task-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import type { UserScope } from "../../src/shared/contracts";
import { AppError } from "../../src/shared/errors";
import { FakeClock, SequenceIds, testInboundDependencies } from "../helpers";

const values = {
  language: "it" as const,
  timeZone: "Europe/Rome",
  hourFormat: "24h" as const,
  defaultCurrency: "EUR",
};

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];
  retryableFailures = 0;

  send(_chatId: number, text: string): Promise<{ readonly messageId: string }> {
    this.texts.push(text);
    if (this.retryableFailures > 0) {
      this.retryableFailures -= 1;
      return Promise.reject(new AppError("RETRYABLE_EXTERNAL", true));
    }
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

function mutationContext(
  key: string,
  token: string,
  now: Date,
): PreferenceMutationContext {
  return {
    actorUserId: "user-a",
    correlationId: `correlation-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: token,
    now,
    undoExpiresAt: new Date(now.getTime() + 15 * 60 * 1_000),
  };
}

function envelope(updateId: number, text: string): InboundMessageEnvelope {
  return {
    version: 1,
    type: "INBOUND_MESSAGE",
    jobId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    idempotencyKey: `telegram-update:${String(updateId)}`,
    createdAt: "2026-08-08T08:00:00.000Z",
    attempt: 0,
    payload: {
      updateId,
      message: {
        messageId: updateId,
        sentAtUnix: 1_786_176_000,
        sender: { id: 7001, isBot: false },
        chat: { id: 7001, type: "private" },
        text,
        forwarded: false,
      },
    },
  };
}

async function insertUser(userId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
  )
    .bind(userId, Date.parse("2026-08-08T08:00:00.000Z"))
    .run();
}

describe("B1.1 preference repository", () => {
  const scope: UserScope = { userId: "user-a" };
  let clock: FakeClock;
  let preferences: D1PreferenceRepository;

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM preference_undo_actions"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM users"),
    ]);
    await insertUser("user-a");
    await insertUser("user-b");
    clock = new FakeClock();
    preferences = new D1PreferenceRepository(env.DB);
  });

  it("creates, reads, updates and restores a profile with atomic audit", async () => {
    const created = await preferences.set(
      scope,
      values,
      mutationContext("preferences-1", "undo-token-00000001", clock.now()),
    );
    expect(created).toMatchObject({
      outcome: "created",
      profile: { version: 1 },
    });
    await expect(preferences.get(scope)).resolves.toEqual(created.profile);

    const updated = await preferences.set(
      scope,
      { ...values, timeZone: "America/New_York", hourFormat: "12h" },
      mutationContext("preferences-2", "undo-token-00000002", clock.now()),
    );
    expect(updated).toMatchObject({
      outcome: "updated",
      profile: { version: 2 },
    });

    if (updated.undoToken === null) throw new Error("fixture token missing");

    const reverted = await preferences.undo(scope, updated.undoToken, {
      actorUserId: scope.userId,
      correlationId: "correlation-undo-2",
      idempotencyKey: "preferences-undo-2",
      auditId: "audit-undo-2",
      now: clock.now(),
    });
    expect(reverted).toEqual({
      outcome: "reverted",
      profile: { ...created.profile, version: 3 },
    });
    await expect(preferences.get(scope)).resolves.toEqual({
      ...created.profile,
      version: 3,
    });

    const audit = await env.DB.prepare(
      `SELECT action, before_json, after_json FROM audit_log
       WHERE scope_user_id = ? AND entity_type = 'user_preferences'
       ORDER BY created_at, action`,
    )
      .bind(scope.userId)
      .all<{ action: string; before_json: string; after_json: string }>();
    expect(audit.results.map((row) => row.action).sort()).toEqual([
      "preferences.created",
      "preferences.reverted",
      "preferences.updated",
    ]);
    expect(
      audit.results.every((row) => row.before_json !== row.after_json),
    ).toBe(true);
  });

  it("returns the original receipt for a duplicate mutation", async () => {
    const first = await preferences.set(
      scope,
      values,
      mutationContext("duplicate-key", "undo-token-duplicate", clock.now()),
    );
    const duplicate = await preferences.set(
      scope,
      { ...values, timeZone: "Asia/Tokyo" },
      mutationContext("duplicate-key", "unused-token-duplicate", clock.now()),
    );
    expect(duplicate).toEqual({ ...first, outcome: "duplicate" });

    clock.advance(15 * 60 * 1_000);
    await preferences.purgeExpiredUndo(scope, clock.now(), 100);
    const lateDuplicate = await preferences.set(
      scope,
      { ...values, timeZone: "Pacific/Auckland" },
      mutationContext(
        "duplicate-key",
        "unused-token-late-duplicate",
        clock.now(),
      ),
    );
    expect(lateDuplicate).toEqual({
      outcome: "duplicate",
      profile: first.profile,
      undoToken: null,
      undoExpiresAt: null,
    });

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM user_preferences WHERE user_id = ?) AS profiles,
         (SELECT COUNT(*) FROM preference_undo_actions WHERE scope_user_id = ?) AS undos,
         (SELECT COUNT(*) FROM audit_log WHERE scope_user_id = ? AND entity_type = 'user_preferences') AS audits`,
    )
      .bind(scope.userId, scope.userId, scope.userId)
      .first<{ profiles: number; undos: number; audits: number }>();
    expect(counts).toEqual({ profiles: 1, undos: 0, audits: 1 });
  });

  it("undoes initial creation by removing only that user's profile", async () => {
    const created = await preferences.set(
      scope,
      values,
      mutationContext("create-to-undo", "undo-token-create-01", clock.now()),
    );
    if (created.undoToken === null) throw new Error("fixture token missing");

    await expect(
      preferences.undo(scope, created.undoToken, {
        actorUserId: scope.userId,
        correlationId: "correlation-create-undo",
        idempotencyKey: "undo-create",
        auditId: "audit-create-undo",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "reverted", profile: null });
    await expect(preferences.get(scope)).resolves.toBeNull();
    await expect(preferences.get({ userId: "user-b" })).resolves.toBeNull();
  });

  it("rejects stale, expired and replayed Undo without changing the profile", async () => {
    const first = await preferences.set(
      scope,
      values,
      mutationContext("stale-1", "undo-token-stale-01", clock.now()),
    );
    await preferences.set(
      scope,
      { ...values, timeZone: "Asia/Tokyo" },
      mutationContext("stale-2", "undo-token-stale-02", clock.now()),
    );
    if (first.undoToken === null) throw new Error("fixture token missing");
    await expect(
      preferences.undo(scope, first.undoToken, {
        actorUserId: scope.userId,
        correlationId: "correlation-stale",
        idempotencyKey: "undo-stale",
        auditId: "audit-stale",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "stale" });

    const current = await preferences.get(scope);
    if (current === null) throw new Error("fixture profile missing");
    const fresh = await preferences.set(
      scope,
      { ...values, defaultCurrency: "USD" },
      mutationContext("fresh-3", "undo-token-fresh-03", clock.now()),
    );
    if (fresh.undoToken === null) throw new Error("fixture token missing");
    const reverted = await preferences.undo(scope, fresh.undoToken, {
      actorUserId: scope.userId,
      correlationId: "correlation-replay",
      idempotencyKey: "undo-replay-1",
      auditId: "audit-replay-1",
      now: clock.now(),
    });
    expect(reverted.outcome).toBe("reverted");
    await expect(
      preferences.undo(scope, fresh.undoToken, {
        actorUserId: scope.userId,
        correlationId: "correlation-replay-2",
        idempotencyKey: "undo-replay-2",
        auditId: "audit-replay-2",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "used" });

    const expiring = await preferences.set(
      scope,
      { ...values, defaultCurrency: "GBP" },
      mutationContext("expiring-4", "undo-token-expire-04", clock.now()),
    );
    if (expiring.undoToken === null) throw new Error("fixture token missing");
    clock.advance(15 * 60 * 1_000);
    await expect(
      preferences.undo(scope, expiring.undoToken, {
        actorUserId: scope.userId,
        correlationId: "correlation-expired",
        idempotencyKey: "undo-expired",
        auditId: "audit-expired",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "expired" });
  });

  it("purges expired Undo records only inside the requested tenant", async () => {
    const userB: UserScope = { userId: "user-b" };
    await preferences.set(
      scope,
      values,
      mutationContext("purge-a", "undo-token-purge-a1", clock.now()),
    );
    await preferences.set(userB, values, {
      ...mutationContext("purge-b", "undo-token-purge-b1", clock.now()),
      actorUserId: userB.userId,
    });
    clock.advance(15 * 60 * 1_000);

    await expect(
      preferences.purgeExpiredUndo(scope, clock.now(), 100),
    ).resolves.toBe(1);
    await expect(
      preferences.purgeExpiredUndo(scope, clock.now(), 100),
    ).resolves.toBe(0);
    const other = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM preference_undo_actions WHERE scope_user_id = ?",
    )
      .bind(userB.userId)
      .first<{ count: number }>();
    expect(other?.count).toBe(1);
  });
});

describe("B1.1 deterministic Telegram flow", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM preference_undo_actions"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  it("applies a complete command once and returns the same profile on read", async () => {
    const clock = new FakeClock();
    const ids = new SequenceIds();
    const reply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const dependencies = testInboundDependencies({
      authorizer: new SelfScopeAuthorizer(),
      clock,
      deliveries: new D1DeliveryRepository(env.DB),
      effects: new D1EffectRepository(env.DB),
      events: new D1EventRepository(env.DB),
      identities: new D1IdentityRepository(env.DB),
      ids,
      inbox,
      preferences: new D1PreferenceRepository(env.DB),
      reminders: new D1ReminderRepository(env.DB),
      tasks: new D1TaskRepository(env.DB),
      reply,
      leaseSeconds: 60,
    });
    const setEnvelope = envelope(
      801,
      "/impostazioni imposta it Europe/Rome 24h EUR",
    );
    await inbox.register(setEnvelope, clock.now());

    await expect(
      processInboundMessage(setEnvelope, dependencies),
    ).resolves.toEqual({ outcome: "completed" });
    await expect(
      processInboundMessage(setEnvelope, dependencies),
    ).resolves.toEqual({ outcome: "duplicate" });
    expect(reply.texts).toHaveLength(1);
    expect(reply.texts[0]).toContain("Impostazioni salvate.");
    expect(reply.texts[0]).toContain("Timezone: Europe/Rome");
    expect(reply.texts[0]).toMatch(/\/annulla [0-9a-f-]{36}/u);

    const readEnvelope = envelope(802, "/impostazioni");
    await inbox.register(readEnvelope, clock.now());
    await processInboundMessage(readEnvelope, dependencies);
    expect(reply.texts[1]).toContain("Impostazioni attuali:");
    expect(reply.texts[1]).toContain("Valuta: EUR");

    const updateEnvelope = envelope(
      805,
      "/impostazioni imposta it America/New_York 12h USD",
    );
    await inbox.register(updateEnvelope, clock.now());
    await processInboundMessage(updateEnvelope, dependencies);
    expect(reply.texts[2]).toContain("Impostazioni aggiornate.");
    const undoToken = reply.texts[2]?.match(/\/annulla ([0-9a-f-]{36})/u)?.[1];
    if (undoToken === undefined)
      throw new Error("Undo token missing from reply");

    const undoEnvelope = envelope(806, `/annulla ${undoToken}`);
    await inbox.register(undoEnvelope, clock.now());
    await processInboundMessage(undoEnvelope, dependencies);
    expect(reply.texts[3]).toContain("Modifica annullata.");
    expect(reply.texts[3]).toContain("Timezone: Europe/Rome");

    const profile = await env.DB.prepare(
      "SELECT time_zone, default_currency, version FROM user_preferences",
    ).first<{
      time_zone: string;
      default_currency: string;
      version: number;
    }>();
    expect(profile).toEqual({
      time_zone: "Europe/Rome",
      default_currency: "EUR",
      version: 3,
    });
  });

  it("rejects incomplete or invalid temporal input without persistence", async () => {
    const clock = new FakeClock();
    const ids = new SequenceIds();
    const reply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const dependencies = testInboundDependencies({
      authorizer: new SelfScopeAuthorizer(),
      clock,
      deliveries: new D1DeliveryRepository(env.DB),
      effects: new D1EffectRepository(env.DB),
      events: new D1EventRepository(env.DB),
      identities: new D1IdentityRepository(env.DB),
      ids,
      inbox,
      preferences: new D1PreferenceRepository(env.DB),
      reminders: new D1ReminderRepository(env.DB),
      tasks: new D1TaskRepository(env.DB),
      reply,
      leaseSeconds: 60,
    });

    for (const [updateId, text] of [
      [803, "/impostazioni imposta it"],
      [804, "/impostazioni imposta it +02:00 24h EUR"],
    ] as const) {
      const commandEnvelope = envelope(updateId, text);
      await inbox.register(commandEnvelope, clock.now());
      await processInboundMessage(commandEnvelope, dependencies);
    }

    expect(reply.texts[0]).toContain("Usa: /impostazioni imposta");
    expect(reply.texts[1]).toContain("Timezone non valida");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM user_preferences",
    ).first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it("does not repeat a preference mutation when Queue retries the reply", async () => {
    const clock = new FakeClock();
    const ids = new SequenceIds();
    const reply = new CapturingReply();
    reply.retryableFailures = 1;
    const inbox = new D1InboundRepository(env.DB);
    const setEnvelope = envelope(
      807,
      "/impostazioni imposta it Europe/Rome 24h EUR",
    );
    await inbox.register(setEnvelope, clock.now());
    const workerEnv: Env = {
      ...env,
      TELEGRAM_BOT_TOKEN: "test-bot-token",
      TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
    };

    const firstBatch = createMessageBatch("tessavio-inbound-dev", [
      {
        id: "preference-retry-1",
        timestamp: clock.now(),
        attempts: 1,
        body: setEnvelope,
      },
    ]);
    await handleInboundQueue(firstBatch, workerEnv, { clock, ids, reply });

    const retryBatch = createMessageBatch("tessavio-inbound-dev", [
      {
        id: "preference-retry-2",
        timestamp: clock.now(),
        attempts: 2,
        body: setEnvelope,
      },
    ]);
    await handleInboundQueue(retryBatch, workerEnv, { clock, ids, reply });

    expect(reply.texts).toHaveLength(2);
    expect(reply.texts[1]).toContain("Impostazioni già applicate.");
    const stored = await env.DB.prepare(
      `SELECT p.version,
              (SELECT COUNT(*) FROM audit_log a
               WHERE a.entity_type = 'user_preferences') AS audits,
              (SELECT COUNT(*) FROM preference_undo_actions) AS undos
       FROM user_preferences p`,
    ).first<{ version: number; audits: number; undos: number }>();
    expect(stored).toEqual({ version: 1, audits: 1, undos: 1 });
  });
});
