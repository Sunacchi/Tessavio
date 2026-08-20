import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { FinanceMutationContext } from "../../src/application/ports/finance";
import type { TelegramReplyPort } from "../../src/application/ports/telegram";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import { processInboundMessage } from "../../src/application/process-inbound";
import { validateFinanceDateRange } from "../../src/domains/finance/finance";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import { D1DeliveryRepository } from "../../src/infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../../src/infrastructure/db/effect-repository";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1FinanceRepository } from "../../src/infrastructure/db/finance-repository";
import { D1IdentityRepository } from "../../src/infrastructure/db/identity-repository";
import { D1InboundRepository } from "../../src/infrastructure/db/inbound-repository";
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
      : Promise.resolve({ messageId: "finance-retry-success" });
  }
}

function envelope(updateId: number, text: string): InboundMessageEnvelope {
  const suffix = String(updateId).padStart(12, "0");
  return {
    version: 1,
    type: "INBOUND_MESSAGE",
    jobId: `20000000-0000-4000-8000-${suffix}`,
    correlationId: `20000000-0000-4000-9000-${suffix}`,
    idempotencyKey: `telegram-update:${String(updateId)}`,
    createdAt: "2026-08-08T10:00:00.000Z",
    attempt: 0,
    payload: {
      updateId,
      message: {
        messageId: updateId,
        sentAtUnix: Date.parse("2026-08-08T10:00:00Z") / 1_000,
        sender: { id: 8501, isBot: false },
        chat: { id: 8501, type: "private" },
        text,
      },
    },
  };
}

describe("B5 finance flow", () => {
  const now = new Date("2026-08-08T10:00:00Z");
  const scope = { userId: "finance-user" };
  let finance: D1FinanceRepository;
  const context = (key: string): FinanceMutationContext => ({
    actorUserId: scope.userId,
    provenance: "entered",
    correlationId: `corr-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `fin_${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  });
  const values = (amountMinor: number, currency = "EUR") => ({
    kind: "expense" as const,
    amountMinor,
    currency,
    localDate: "2026-08-08",
    category: "Alimentari",
    merchant: "Mercato",
    paymentMethod: "carta",
    note: null,
  });

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM finance_undo_actions"),
      env.DB.prepare("DELETE FROM finance_entries"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(scope.userId, now.getTime()),
    ]);
    finance = new D1FinanceRepository(env.DB);
  });

  it("creates idempotently, corrects with versioning, soft-deletes, undoes and totals by currency", async () => {
    const created = await finance.create(
      scope,
      "expense-eur",
      values(100),
      context("create-expense"),
    );
    expect(created.outcome).toBe("created");
    expect(
      (
        await finance.create(
          scope,
          "ignored",
          values(999),
          context("create-expense"),
        )
      ).outcome,
    ).toBe("duplicate");
    await finance.create(
      scope,
      "income-eur",
      { ...values(300), kind: "income", category: "Stipendio" },
      context("create-income"),
    );
    await finance.create(
      scope,
      "expense-usd",
      values(50, "USD"),
      context("create-usd"),
    );

    const corrected = await finance.update(
      scope,
      "expense-eur",
      1,
      values(120),
      context("update-expense"),
    );
    expect(corrected).toMatchObject({
      outcome: "updated",
      entry: { amountMinor: 120, version: 2 },
    });
    expect(
      (
        await finance.update(
          scope,
          "expense-eur",
          1,
          values(130),
          context("stale-update"),
        )
      ).outcome,
    ).toBe("stale");

    const range = validateFinanceDateRange({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    if (!range.ok) throw new Error("range");
    expect(await finance.totals(scope, range.value)).toEqual([
      {
        currency: "EUR",
        expenseMinor: 120n,
        incomeMinor: 300n,
        netMinor: 180n,
        entryCount: 2,
      },
      {
        currency: "USD",
        expenseMinor: 50n,
        incomeMinor: 0n,
        netMinor: -50n,
        entryCount: 1,
      },
    ]);

    expect(
      (await finance.delete(scope, "income-eur", 1, context("delete-income")))
        .outcome,
    ).toBe("deleted");
    expect(await finance.get(scope, "income-eur")).toBeNull();
    expect(
      await finance.undo(scope, "fin_delete-income", {
        ...context("undo-delete"),
        now,
      }),
    ).toMatchObject({
      outcome: "reverted",
      entry: { id: "income-eur", status: "active", version: 3 },
    });
    expect(
      await finance.undo(scope, "fin_update-expense", {
        ...context("undo-update"),
        now,
      }),
    ).toMatchObject({
      outcome: "reverted",
      entry: { id: "expense-eur", amountMinor: 100, version: 3 },
    });
    expect(
      await finance.undo(scope, "fin_create-usd", {
        ...context("undo-create"),
        now,
      }),
    ).toEqual({ outcome: "reverted", entry: null });
    expect(await finance.get(scope, "expense-usd")).toBeNull();
  });

  it("handles Undo replay, expiry and stale versions deterministically", async () => {
    await finance.create(scope, "entry", values(100), context("create"));
    const first = await finance.undo(scope, "fin_create", {
      ...context("undo-same"),
      now,
    });
    expect(first).toEqual({ outcome: "reverted", entry: null });
    expect(
      await finance.undo(scope, "fin_create", {
        ...context("undo-same"),
        now,
      }),
    ).toEqual({ outcome: "duplicate", entry: null });
    expect(
      await finance.undo(scope, "fin_create", {
        ...context("undo-different"),
        now,
      }),
    ).toEqual({ outcome: "used" });

    await finance.create(scope, "expired", values(1), context("expired"));
    expect(
      await finance.undo(scope, "fin_expired", {
        ...context("undo-expired"),
        now: new Date(now.getTime() + 900_001),
      }),
    ).toEqual({ outcome: "expired" });

    await finance.create(scope, "stale", values(1), context("stale-create"));
    await finance.update(scope, "stale", 1, values(2), context("stale-update"));
    expect(
      await finance.undo(scope, "fin_stale-create", {
        ...context("undo-stale"),
        now,
      }),
    ).toEqual({ outcome: "stale" });
  });

  it("runs commands end-to-end and does not duplicate a committed write when reply delivery retries", async () => {
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
      preferences: new D1PreferenceRepository(env.DB),
      reminders: new D1ReminderRepository(env.DB),
      tasks: new D1TaskRepository(env.DB),
      work: new D1WorkRepository(env.DB),
      reply,
      leaseSeconds: 60,
    });
    const createMessage = envelope(
      8_501,
      "/finanze crea spesa 1299 EUR 2026-08-08 | Alimentari | Mercato | carta | -",
    );
    await inbox.register(createMessage, clock.now());
    await processInboundMessage(createMessage, dependencies);
    expect(reply.texts[0]).toContain("1299 EUR (unità minori)");
    const entryId = reply.texts[0]?.match(/ID: ([A-Za-z0-9-]+)/u)?.[1];
    if (entryId === undefined) throw new Error("finance ID missing");
    for (const message of [
      envelope(
        8_502,
        `/finanze correggi ${entryId} 1 spesa 1499 EUR 2026-08-08 | Alimentari | Mercato | carta | corretta`,
      ),
      envelope(8_503, `/finanze leggi ${entryId}`),
      envelope(8_504, "/finanze lista 2026-08-01 2026-08-31"),
      envelope(8_505, "/finanze totali 2026-08-01 2026-08-31"),
      envelope(8_506, `/finanze elimina ${entryId} 2`),
    ]) {
      await inbox.register(message, clock.now());
      await processInboundMessage(message, dependencies);
    }
    expect(reply.texts[1]).toContain("Movimento corretto");
    expect(reply.texts[2]).toContain("Versione: 2");
    expect(reply.texts[3]).toContain("corretta");
    expect(reply.texts[4]).toContain("Netto registrato: -1499");
    expect(reply.texts[5]).toContain("Movimento eliminato");
    const deleteUndo = reply.texts[5]?.match(
      /\/annulla (fin_[A-Za-z0-9_-]+)/u,
    )?.[1];
    if (deleteUndo === undefined) throw new Error("finance Undo missing");
    const undoMessage = envelope(8_507, `/annulla ${deleteUndo}`);
    await inbox.register(undoMessage, clock.now());
    await processInboundMessage(undoMessage, dependencies);
    expect(reply.texts[6]).toContain("Modifica movimento annullata");
    const restored = await env.DB.prepare(
      "SELECT status, version FROM finance_entries WHERE id = ?",
    )
      .bind(entryId)
      .first<{ status: string; version: number }>();
    expect(restored).toEqual({ status: "active", version: 4 });

    const retryMessage = envelope(
      8_508,
      "/finanze crea entrata 250000 EUR 2026-08-08 | Stipendio | - | bonifico | -",
    );
    await inbox.register(retryMessage, clock.now());
    const retryReply = new RetryOnceReply();
    await handleInboundQueue(
      createMessageBatch("tessavio-inbound-dev", [
        {
          id: "finance-first-attempt",
          timestamp: clock.now(),
          attempts: 1,
          body: retryMessage,
        },
      ]),
      env,
      { clock, ids, reply: retryReply },
    );
    clock.advance(60_000);
    await handleInboundQueue(
      createMessageBatch("tessavio-inbound-dev", [
        {
          id: "finance-retry",
          timestamp: clock.now(),
          attempts: 2,
          body: retryMessage,
        },
      ]),
      env,
      { clock, ids, reply: retryReply },
    );
    expect(retryReply.calls).toBe(2);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM finance_entries WHERE entry_kind = 'income'",
        ).first<{ count: number }>()
      )?.count,
    ).toBe(1);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'finance.created'",
        ).first<{ count: number }>()
      )?.count,
    ).toBe(2);
  });
});
