import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import type {
  EventMutationContext,
  TelegramReplyPort,
} from "../../src/application/ports";
import { processInboundMessage } from "../../src/application/process-inbound";
import {
  eventDayWindow,
  validateInstantEvent,
  type EventValues,
} from "../../src/domains/events/events";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import { D1DeliveryRepository } from "../../src/infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../../src/infrastructure/db/effect-repository";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1IdentityRepository } from "../../src/infrastructure/db/identity-repository";
import { D1InboundRepository } from "../../src/infrastructure/db/inbound-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1ReminderRepository } from "../../src/infrastructure/db/reminder-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import type { UserScope } from "../../src/shared/contracts";
import { AppError } from "../../src/shared/errors";
import { FakeClock, SequenceIds } from "../helpers";

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

function envelope(
  updateId: number,
  text: string,
  sentAtUnix = Date.parse("2026-08-08T08:00:00Z") / 1_000,
): InboundMessageEnvelope {
  return {
    version: 1,
    type: "INBOUND_MESSAGE",
    jobId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    idempotencyKey: `telegram-update:${String(updateId)}`,
    createdAt: new Date(sentAtUnix * 1_000).toISOString(),
    attempt: 0,
    payload: {
      updateId,
      message: {
        messageId: updateId,
        sentAtUnix,
        sender: { id: 7101, isBot: false },
        chat: { id: 7101, type: "private" },
        text,
      },
    },
  };
}

function mutationContext(
  key: string,
  token: string,
  now: Date,
): EventMutationContext {
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

async function resetDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM event_undo_actions"),
    env.DB.prepare("DELETE FROM events"),
    env.DB.prepare("DELETE FROM preference_undo_actions"),
    env.DB.prepare("DELETE FROM user_preferences"),
    env.DB.prepare("DELETE FROM audit_log"),
    env.DB.prepare("DELETE FROM deliveries"),
    env.DB.prepare("DELETE FROM effects"),
    env.DB.prepare("DELETE FROM telegram_identities"),
    env.DB.prepare("DELETE FROM inbound_updates"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function insertUser(userId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
  )
    .bind(userId, Date.parse("2026-08-08T08:00:00Z"))
    .run();
}

function instantValues(): EventValues {
  const result = validateInstantEvent({
    title: "Turno serale",
    startLocal: "2026-08-08T22:30",
    endLocal: "2026-08-09T01:30",
    timeZone: "Europe/Rome",
  });
  if (!result.ok) throw new Error(`invalid fixture: ${result.issue}`);
  return result.value;
}

describe("B1.2 event repository", () => {
  const scope: UserScope = { userId: "user-a" };
  let clock: FakeClock;
  let events: D1EventRepository;

  beforeEach(async () => {
    await resetDatabase();
    await insertUser("user-a");
    await insertUser("user-b");
    clock = new FakeClock();
    events = new D1EventRepository(env.DB);
  });

  it("persists date-only and instant events with distinct shapes and scoped day views", async () => {
    await events.create(
      scope,
      "event-date",
      { kind: "date_only", title: "Giorno libero", localDate: "2026-08-08" },
      mutationContext("create-date", "evt_undo-date-0001", clock.now()),
    );
    await events.create(
      scope,
      "event-instant",
      instantValues(),
      mutationContext("create-instant", "evt_undo-instant-01", clock.now()),
    );

    const today = await events.listForDay(
      scope,
      eventDayWindow(
        Date.parse("2026-08-08T20:00:00Z") / 1_000,
        "Europe/Rome",
        0,
      ),
    );
    expect(today.map((event) => event.id)).toEqual([
      "event-date",
      "event-instant",
    ]);
    const tomorrow = await events.listForDay(
      scope,
      eventDayWindow(
        Date.parse("2026-08-08T20:00:00Z") / 1_000,
        "Europe/Rome",
        1,
      ),
    );
    expect(tomorrow.map((event) => event.id)).toEqual(["event-instant"]);

    const rows = await env.DB.prepare(
      `SELECT event_kind, local_date, start_at_utc, end_at_utc, time_zone
       FROM events WHERE user_id = ? ORDER BY id`,
    )
      .bind(scope.userId)
      .all<{
        event_kind: string;
        local_date: string | null;
        start_at_utc: number | null;
        end_at_utc: number | null;
        time_zone: string | null;
      }>();
    expect(rows.results).toEqual([
      {
        event_kind: "date_only",
        local_date: "2026-08-08",
        start_at_utc: null,
        end_at_utc: null,
        time_zone: null,
      },
      {
        event_kind: "instant",
        local_date: null,
        start_at_utc: Date.parse("2026-08-08T20:30:00Z"),
        end_at_utc: Date.parse("2026-08-08T23:30:00Z"),
        time_zone: "Europe/Rome",
      },
    ]);
  });

  it("updates, cancels and undoes with monotonic version and atomic audit", async () => {
    const created = await events.create(
      scope,
      "event-lifecycle",
      { kind: "date_only", title: "Bozza", localDate: "2026-08-08" },
      mutationContext("lifecycle-create", "evt_lifecycle-create", clock.now()),
    );
    expect(created.outcome).toBe("created");
    const updated = await events.update(
      scope,
      "event-lifecycle",
      instantValues(),
      mutationContext("lifecycle-update", "evt_lifecycle-update", clock.now()),
    );
    expect(updated).toMatchObject({
      outcome: "updated",
      event: { kind: "instant", version: 2 },
    });
    const cancelled = await events.cancel(
      scope,
      "event-lifecycle",
      mutationContext("lifecycle-cancel", "evt_lifecycle-cancel", clock.now()),
    );
    expect(cancelled).toMatchObject({
      outcome: "cancelled",
      event: { status: "cancelled", version: 3 },
    });
    await expect(
      events.undo(scope, "evt_lifecycle-cancel", {
        actorUserId: scope.userId,
        correlationId: "undo-cancel",
        idempotencyKey: "undo-cancel",
        auditId: "audit-undo-cancel",
        now: clock.now(),
      }),
    ).resolves.toMatchObject({
      outcome: "reverted",
      event: { status: "active", version: 4 },
    });
    await expect(
      events.undo(scope, "evt_lifecycle-update", {
        actorUserId: scope.userId,
        correlationId: "undo-stale",
        idempotencyKey: "undo-stale",
        auditId: "audit-undo-stale",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "stale" });

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_log
       WHERE scope_user_id = ? AND entity_type = 'event'
       ORDER BY rowid`,
    )
      .bind(scope.userId)
      .all<{ action: string }>();
    expect(audit.results.map((row) => row.action)).toEqual([
      "event.created",
      "event.updated",
      "event.cancelled",
      "event.reverted",
    ]);
  });

  it("deduplicates mutations and purges expired Undo only in the requested scope", async () => {
    const context = mutationContext(
      "duplicate-create",
      "evt_duplicate-create",
      clock.now(),
    );
    const first = await events.create(
      scope,
      "event-original",
      { kind: "date_only", title: "Originale", localDate: "2026-08-08" },
      context,
    );
    const duplicate = await events.create(
      scope,
      "event-ignored",
      { kind: "date_only", title: "Ignorato", localDate: "2026-09-01" },
      { ...context, auditId: "unused", undoToken: "evt_unused" },
    );
    expect(duplicate).toEqual({ ...first, outcome: "duplicate" });

    await events.create(
      { userId: "user-b" },
      "event-b",
      { kind: "date_only", title: "Privato B", localDate: "2026-08-08" },
      {
        ...mutationContext("create-b", "evt_create-b", clock.now()),
        actorUserId: "user-b",
      },
    );
    clock.advance(15 * 60 * 1_000);
    await expect(
      events.purgeExpiredUndo(scope, clock.now(), 100),
    ).resolves.toBe(1);
    await expect(
      events.purgeExpiredUndo(scope, clock.now(), 100),
    ).resolves.toBe(0);
    const otherCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM event_undo_actions WHERE scope_user_id = ?",
    )
      .bind("user-b")
      .first<{ count: number }>();
    expect(otherCount?.count).toBe(1);
  });

  it("undoes an initial creation once and rejects replay", async () => {
    await events.create(
      scope,
      "event-to-remove",
      { kind: "date_only", title: "Temporaneo", localDate: "2026-08-08" },
      mutationContext("create-remove", "evt_create-remove", clock.now()),
    );
    const context = {
      actorUserId: scope.userId,
      correlationId: "undo-create",
      idempotencyKey: "undo-create",
      auditId: "audit-undo-create",
      now: clock.now(),
    };
    await expect(
      events.undo(scope, "evt_create-remove", context),
    ).resolves.toEqual({ outcome: "reverted", event: null });
    await expect(events.get(scope, "event-to-remove")).resolves.toBeNull();
    await expect(
      events.undo(scope, "evt_create-remove", {
        ...context,
        correlationId: "undo-replay",
        idempotencyKey: "undo-replay",
        auditId: "audit-undo-replay",
      }),
    ).resolves.toEqual({ outcome: "used" });
  });

  it("rejects expired Undo without changing the event", async () => {
    await events.create(
      scope,
      "event-expired-undo",
      { kind: "date_only", title: "Persistente", localDate: "2026-08-08" },
      mutationContext("create-expiring", "evt_expired-token", clock.now()),
    );
    clock.advance(15 * 60 * 1_000);
    await expect(
      events.undo(scope, "evt_expired-token", {
        actorUserId: scope.userId,
        correlationId: "expired-undo",
        idempotencyKey: "expired-undo",
        auditId: "audit-expired-undo",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "expired" });
    await expect(
      events.get(scope, "event-expired-undo"),
    ).resolves.toMatchObject({ title: "Persistente", version: 1 });
  });
});

describe("B1.2 deterministic Telegram flow", () => {
  beforeEach(resetDatabase);

  it("creates, reads, updates, cancels, undoes and lists without AI", async () => {
    const clock = new FakeClock();
    const ids = new SequenceIds();
    const reply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const dependencies = {
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
      reply,
      leaseSeconds: 60,
    };

    for (const command of [
      envelope(901, "/impostazioni imposta it Europe/Rome 24h EUR"),
      envelope(902, "/evento crea data 2026-08-08 | Festa"),
      envelope(
        903,
        "/evento crea ora 2026-08-08T22:30 2026-08-09T01:30 | Turno serale",
      ),
      envelope(904, "/oggi"),
      envelope(905, "/domani"),
    ]) {
      await inbox.register(command, clock.now());
      await processInboundMessage(command, dependencies);
    }

    expect(reply.texts[1]).toContain("Evento creato.");
    expect(reply.texts[3]).toContain("Festa");
    expect(reply.texts[3]).toContain("Turno serale");
    expect(reply.texts[4]).not.toContain("Festa");
    expect(reply.texts[4]).toContain("Turno serale");

    const eventId = reply.texts[1]?.match(/ID: ([A-Za-z0-9-]+)/u)?.[1];
    if (eventId === undefined) throw new Error("event ID missing");
    for (const command of [
      envelope(906, `/evento leggi ${eventId}`),
      envelope(
        907,
        `/evento modifica ${eventId} data 2026-08-09 | Festa spostata`,
      ),
      envelope(908, `/evento annulla ${eventId}`),
    ]) {
      await inbox.register(command, clock.now());
      await processInboundMessage(command, dependencies);
    }
    expect(reply.texts[5]).toContain("Festa");
    expect(reply.texts[6]).toContain("Evento aggiornato.");
    expect(reply.texts[7]).toContain("Evento annullato.");
    const undoToken = reply.texts[7]?.match(
      /\/annulla (evt_[A-Za-z0-9_-]+)/u,
    )?.[1];
    if (undoToken === undefined) throw new Error("event Undo token missing");
    const undo = envelope(909, `/annulla ${undoToken}`);
    await inbox.register(undo, clock.now());
    await processInboundMessage(undo, dependencies);
    expect(reply.texts[8]).toContain("Modifica evento annullata.");

    const stored = await env.DB.prepare(
      "SELECT status, version FROM events WHERE id = ?",
    )
      .bind(eventId)
      .first<{ status: string; version: number }>();
    expect(stored).toEqual({ status: "active", version: 4 });
  });

  it("does not repeat an event mutation when Queue retries the reply", async () => {
    const clock = new FakeClock();
    const ids = new SequenceIds();
    const setupReply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const preferencesEnvelope = envelope(
      920,
      "/impostazioni imposta it Europe/Rome 24h EUR",
    );
    await inbox.register(preferencesEnvelope, clock.now());
    await processInboundMessage(preferencesEnvelope, {
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
      reply: setupReply,
      leaseSeconds: 60,
    });

    const reply = new CapturingReply();
    reply.retryableFailures = 1;
    const eventEnvelope = envelope(
      921,
      "/evento crea data 2026-08-08 | Una sola volta",
    );
    await inbox.register(eventEnvelope, clock.now());
    const workerEnv: Env = {
      ...env,
      TELEGRAM_BOT_TOKEN: "test-bot-token",
      TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
    };
    for (const [id, attempts] of [
      ["event-retry-1", 1],
      ["event-retry-2", 2],
    ] as const) {
      await handleInboundQueue(
        createMessageBatch("tessavio-inbound-dev", [
          {
            id,
            timestamp: clock.now(),
            attempts,
            body: eventEnvelope,
          },
        ]),
        workerEnv,
        { clock, ids, reply },
      );
    }
    expect(reply.texts).toHaveLength(2);
    expect(reply.texts[1]).toContain("Creazione evento già applicata.");
    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM events) AS events,
         (SELECT COUNT(*) FROM audit_log WHERE entity_type = 'event') AS audits,
         (SELECT COUNT(*) FROM event_undo_actions) AS undos`,
    ).first<{ events: number; audits: number; undos: number }>();
    expect(counts).toEqual({ events: 1, audits: 1, undos: 1 });
  });

  it("rejects missing preferences and ambiguous DST input without persistence", async () => {
    const clock = new FakeClock();
    const ids = new SequenceIds();
    const reply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const dependencies = {
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
      reply,
      leaseSeconds: 60,
    };
    for (const command of [
      envelope(930, "/evento crea data 2026-08-08 | Senza profilo"),
      envelope(931, "/impostazioni imposta it Europe/Rome 24h EUR"),
      envelope(
        932,
        "/evento crea ora 2026-10-25T02:30 2026-10-25T02:45 | Ambiguo",
      ),
      envelope(933, "/evento crea data 2026-08-08"),
    ]) {
      await inbox.register(command, clock.now());
      await processInboundMessage(command, dependencies);
    }
    expect(reply.texts[0]).toContain("Configura prima la timezone");
    expect(reply.texts[2]).toContain("inesistente o ambigua");
    expect(reply.texts[3]).toContain("/evento crea data");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM events",
    ).first<{ count: number }>();
    expect(count?.count).toBe(0);
  });
});
