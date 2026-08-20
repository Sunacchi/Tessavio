import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  ListMutationContext,
  TelegramReplyPort,
} from "../../src/application/ports";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import { processInboundMessage } from "../../src/application/process-inbound";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import { D1DeliveryRepository } from "../../src/infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../../src/infrastructure/db/effect-repository";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1FinanceRepository } from "../../src/infrastructure/db/finance-repository";
import { D1IdentityRepository } from "../../src/infrastructure/db/identity-repository";
import { D1InboundRepository } from "../../src/infrastructure/db/inbound-repository";
import { D1ListRepository } from "../../src/infrastructure/db/list-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1ReminderRepository } from "../../src/infrastructure/db/reminder-repository";
import { D1TaskRepository } from "../../src/infrastructure/db/task-repository";
import { D1WorkRepository } from "../../src/infrastructure/db/work-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { AppError } from "../../src/shared/errors";
import { FakeClock, SequenceIds, testInboundDependencies } from "../helpers";

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];

  send(_chatId: number, text: string): Promise<{ readonly messageId: string }> {
    this.texts.push(text);
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

class RetryOnceReply implements TelegramReplyPort {
  calls = 0;

  send(): Promise<{ readonly messageId: string }> {
    this.calls += 1;
    return this.calls === 1
      ? Promise.reject(new AppError("RETRYABLE_EXTERNAL", true))
      : Promise.resolve({ messageId: "lists-retry-success" });
  }
}

function envelope(updateId: number, text: string): InboundMessageEnvelope {
  const suffix = String(updateId).padStart(12, "0");
  return {
    version: 1,
    type: "INBOUND_MESSAGE",
    jobId: `26000000-0000-4000-8000-${suffix}`,
    correlationId: `26000000-0000-4000-9000-${suffix}`,
    idempotencyKey: `telegram-update:${String(updateId)}`,
    createdAt: "2026-08-19T10:00:00.000Z",
    attempt: 0,
    payload: {
      updateId,
      message: {
        messageId: updateId,
        sentAtUnix: Date.parse("2026-08-19T10:00:00Z") / 1_000,
        sender: { id: 8_601, isBot: false },
        chat: { id: 8_601, type: "private" },
        text,
      },
    },
  };
}

describe("B6.1 private lists and notes flow", () => {
  const now = new Date("2026-08-19T10:00:00Z");
  const scope = { userId: "lists-user" };
  let lists: D1ListRepository;
  const context = (key: string): ListMutationContext => ({
    actorUserId: scope.userId,
    correlationId: `corr-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `lst_${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  });

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM list_undo_actions"),
      env.DB.prepare("DELETE FROM list_items"),
      env.DB.prepare("DELETE FROM notes"),
      env.DB.prepare("DELETE FROM lists"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(scope.userId, now.getTime()),
    ]);
    lists = new D1ListRepository(env.DB);
  });

  it("manages lists, item states, notes, version checks and Undo", async () => {
    expect(
      await lists.createList(
        scope,
        "list-1",
        { title: "Spesa" },
        context("create-list"),
      ),
    ).toMatchObject({ outcome: "created", entity: { version: 1 } });
    expect(
      (
        await lists.createList(
          scope,
          "ignored",
          { title: "Duplicata" },
          context("create-list"),
        )
      ).outcome,
    ).toBe("duplicate");
    expect(
      (
        await lists.createItem(
          scope,
          "item-1",
          "list-1",
          { text: "Latte" },
          context("create-item"),
        )
      ).outcome,
    ).toBe("created");
    expect(
      (await lists.deleteList(scope, "list-1", 1, context("blocked-delete")))
        .outcome,
    ).toBe("list_not_empty");
    expect(
      (await lists.completeItem(scope, "item-1", 1, context("complete")))
        .outcome,
    ).toBe("completed");
    expect(
      (await lists.reopenItem(scope, "item-1", 2, context("reopen"))).outcome,
    ).toBe("reopened");
    expect(
      (await lists.deleteItem(scope, "item-1", 3, context("delete-item")))
        .outcome,
    ).toBe("deleted");
    expect(
      (await lists.deleteList(scope, "list-1", 1, context("delete-list")))
        .outcome,
    ).toBe("deleted");
    expect(await lists.getList(scope, "list-1")).toBeNull();
    expect(
      await lists.undo(scope, "lst_delete-list", {
        ...context("undo-list"),
        now,
      }),
    ).toMatchObject({ outcome: "reverted", entityKind: "list" });
    expect((await lists.getList(scope, "list-1"))?.list.version).toBe(3);
    expect(
      await lists.undo(scope, "lst_delete-item", {
        ...context("undo-item"),
        now,
      }),
    ).toMatchObject({ outcome: "reverted", entityKind: "item" });
    expect((await lists.getList(scope, "list-1"))?.items[0]).toMatchObject({
      status: "open",
      version: 5,
    });
    expect(
      await lists.undo(scope, "lst_create-list", {
        ...context("undo-create-list"),
        now,
      }),
    ).toEqual({ outcome: "stale" });

    await lists.createNote(
      scope,
      "note-1",
      { title: "Casa", body: "Misure cucina" },
      context("create-note"),
    );
    expect(
      await lists.updateNote(
        scope,
        "note-1",
        1,
        { title: "Casa", body: "Misure aggiornate" },
        context("update-note"),
      ),
    ).toMatchObject({ outcome: "updated", entity: { version: 2 } });
    expect(
      (await lists.deleteNote(scope, "note-1", 1, context("stale-note")))
        .outcome,
    ).toBe("stale");
    expect(
      (await lists.deleteNote(scope, "note-1", 2, context("delete-note")))
        .outcome,
    ).toBe("deleted");
    expect(
      await lists.undo(scope, "lst_delete-note", {
        ...context("undo-note"),
        now,
      }),
    ).toMatchObject({ outcome: "reverted", entityKind: "note" });
    expect(await lists.getNote(scope, "note-1")).toMatchObject({
      body: "Misure aggiornate",
      version: 4,
    });
  });

  it("runs commands end-to-end and does not duplicate a committed write after reply retry", async () => {
    await env.DB.prepare("DELETE FROM users").run();
    const clock = new FakeClock(now);
    const ids = new SequenceIds();
    const inbox = new D1InboundRepository(env.DB);
    const reply = new CapturingReply();
    const dependencies = testInboundDependencies({
      authorizer: new SelfScopeAuthorizer(),
      clock,
      deliveries: new D1DeliveryRepository(env.DB),
      effects: new D1EffectRepository(env.DB),
      events: new D1EventRepository(env.DB),
      finance: new D1FinanceRepository(env.DB),
      identities: new D1IdentityRepository(env.DB),
      ids,
      inbox,
      lists: new D1ListRepository(env.DB),
      preferences: new D1PreferenceRepository(env.DB),
      reminders: new D1ReminderRepository(env.DB),
      tasks: new D1TaskRepository(env.DB),
      work: new D1WorkRepository(env.DB),
      reply,
      leaseSeconds: 60,
    });
    const createList = envelope(8_601, "/liste crea | Spesa");
    await inbox.register(createList, clock.now());
    await processInboundMessage(createList, dependencies);
    const listId = reply.texts[0]?.match(/ID: ([A-Za-z0-9-]+)/u)?.[1];
    if (listId === undefined) throw new Error("list ID missing");
    for (const message of [
      envelope(8_602, `/liste aggiungi ${listId} | Latte`),
      envelope(8_603, `/liste leggi ${listId}`),
      envelope(8_604, "/note crea | Casa | Misure cucina"),
      envelope(8_605, "/note lista"),
    ]) {
      await inbox.register(message, clock.now());
      await processInboundMessage(message, dependencies);
    }
    expect(reply.texts[1]).toContain("Item aggiunto");
    expect(reply.texts[2]).toContain("Latte");
    expect(reply.texts[3]).toContain("Nota creata");
    expect(reply.texts[4]).toContain("Casa");

    const retryEnvelope = envelope(8_606, "/liste crea | Viaggio");
    await inbox.register(retryEnvelope, clock.now());
    const retryReply = new RetryOnceReply();
    await handleInboundQueue(
      createMessageBatch("tessavio-inbound-dev", [
        {
          id: "lists-first-attempt",
          timestamp: clock.now(),
          attempts: 1,
          body: retryEnvelope,
        },
      ]),
      env,
      { clock, ids, reply: retryReply },
    );
    clock.advance(60_000);
    await handleInboundQueue(
      createMessageBatch("tessavio-inbound-dev", [
        {
          id: "lists-retry",
          timestamp: clock.now(),
          attempts: 2,
          body: retryEnvelope,
        },
      ]),
      env,
      { clock, ids, reply: retryReply },
    );
    expect(retryReply.calls).toBe(2);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM lists WHERE title = 'Viaggio'",
        ).first<{ count: number }>()
      )?.count,
    ).toBe(1);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'lists.list.created' AND entity_id IN (SELECT id FROM lists WHERE title = 'Viaggio')",
        ).first<{ count: number }>()
      )?.count,
    ).toBe(1);
  });

  it("handles Undo replay, expiry and stale resources deterministically", async () => {
    await lists.createNote(
      scope,
      "replay-note",
      { title: "Replay", body: "Test" },
      context("replay-create"),
    );
    expect(
      await lists.undo(scope, "lst_replay-create", {
        ...context("undo-same"),
        now,
      }),
    ).toMatchObject({ outcome: "reverted", entityKind: "note" });
    expect(
      await lists.undo(scope, "lst_replay-create", {
        ...context("undo-same"),
        now,
      }),
    ).toMatchObject({ outcome: "duplicate", entityKind: "note" });
    expect(
      await lists.undo(scope, "lst_replay-create", {
        ...context("undo-other"),
        now,
      }),
    ).toEqual({ outcome: "used" });

    await lists.createNote(
      scope,
      "expired-note",
      { title: "Scaduta", body: "Test" },
      context("expired-create"),
    );
    expect(
      await lists.undo(scope, "lst_expired-create", {
        ...context("undo-expired"),
        now: new Date(now.getTime() + 900_001),
      }),
    ).toEqual({ outcome: "expired" });

    await lists.createNote(
      scope,
      "stale-note",
      { title: "Stale", body: "Uno" },
      context("stale-create"),
    );
    await lists.updateNote(
      scope,
      "stale-note",
      1,
      { title: "Stale", body: "Due" },
      context("stale-update"),
    );
    expect(
      await lists.undo(scope, "lst_stale-create", {
        ...context("undo-stale"),
        now,
      }),
    ).toEqual({ outcome: "stale" });
  });
});
