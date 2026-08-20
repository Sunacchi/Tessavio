import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import type { TaskMutationContext } from "../../src/application/ports/tasks";
import type { TelegramReplyPort } from "../../src/application/ports/telegram";
import { processInboundMessage } from "../../src/application/process-inbound";
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
import { FakeClock, SequenceIds, testInboundDependencies } from "../helpers";

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];

  send(_chatId: number, text: string): Promise<{ readonly messageId: string }> {
    this.texts.push(text);
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

function envelope(updateId: number, text: string): InboundMessageEnvelope {
  const suffix = String(updateId).padStart(12, "0");
  return {
    version: 1,
    type: "INBOUND_MESSAGE",
    jobId: `00000000-0000-4000-8000-${suffix}`,
    correlationId: `00000000-0000-4000-9000-${suffix}`,
    idempotencyKey: `telegram-update:${String(updateId)}`,
    createdAt: "2026-08-08T08:00:00.000Z",
    attempt: 0,
    payload: {
      updateId,
      message: {
        messageId: updateId,
        sentAtUnix: Date.parse("2026-08-08T08:00:00Z") / 1_000,
        sender: { id: 7301, isBot: false },
        chat: { id: 7301, type: "private" },
        text,
      },
    },
  };
}

function mutationContext(
  key: string,
  token: string,
  now: Date,
): TaskMutationContext {
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
    env.DB.prepare("DELETE FROM task_undo_actions"),
    env.DB.prepare("DELETE FROM tasks"),
    env.DB.prepare("DELETE FROM event_undo_actions"),
    env.DB.prepare("DELETE FROM events"),
    env.DB.prepare("DELETE FROM reminder_undo_actions"),
    env.DB.prepare("DELETE FROM reminders"),
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

describe("B3 task repository", () => {
  const scope: UserScope = { userId: "user-a" };
  const clock = new FakeClock();
  let tasks: D1TaskRepository;

  beforeEach(async () => {
    await resetDatabase();
    await env.DB.prepare(
      "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
    )
      .bind(scope.userId, clock.now().getTime())
      .run();
    tasks = new D1TaskRepository(env.DB);
  });

  it("creates once, transitions idempotently and reopens", async () => {
    const created = await tasks.create(
      scope,
      "task-1",
      {
        dueKind: "date_only",
        dueDateLocal: "2026-08-08",
        priority: "high",
        title: "Pagare la bolletta",
      },
      mutationContext("create-1", "tsk_create-token-1", clock.now()),
    );
    expect(created).toMatchObject({
      outcome: "created",
      task: { id: "task-1", status: "open", version: 1 },
    });
    await expect(
      tasks.create(
        scope,
        "ignored-random-id",
        {
          dueKind: "none",
          priority: "low",
          title: "Ignorata",
        },
        mutationContext("create-1", "tsk_ignored-token", clock.now()),
      ),
    ).resolves.toMatchObject({
      outcome: "duplicate",
      task: { id: "task-1", title: "Pagare la bolletta" },
    });
    const completed = await tasks.complete(
      scope,
      "task-1",
      mutationContext("complete-1", "tsk_complete-token-1", clock.now()),
    );
    expect(completed).toMatchObject({
      outcome: "completed",
      task: { status: "completed", version: 2 },
    });
    await expect(
      tasks.complete(
        scope,
        "task-1",
        mutationContext("complete-2", "tsk_complete-token-2", clock.now()),
      ),
    ).resolves.toEqual({ outcome: "already_completed" });
    await expect(
      tasks.reopen(
        scope,
        "task-1",
        mutationContext("reopen-1", "tsk_reopen-token-1", clock.now()),
      ),
    ).resolves.toMatchObject({
      outcome: "reopened",
      task: { status: "open", version: 3, completedAt: null },
    });
    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM tasks) AS tasks,
         (SELECT COUNT(*) FROM audit_log WHERE entity_type = 'task') AS audits,
         (SELECT COUNT(*) FROM task_undo_actions) AS undos`,
    ).first<{ tasks: number; audits: number; undos: number }>();
    expect(counts).toEqual({ tasks: 1, audits: 3, undos: 3 });
  });

  it("orders open tasks deterministically and filters a local day", async () => {
    const fixtures = [
      ["task-low", { dueKind: "none", priority: "low", title: "Senza data" }],
      [
        "task-high-date",
        {
          dueKind: "date_only",
          dueDateLocal: "2026-08-08",
          priority: "high",
          title: "Alta oggi",
        },
      ],
      [
        "task-medium-time",
        {
          dueKind: "instant",
          dueAtUtc: new Date("2026-08-08T10:00:00Z"),
          originalTimeZone: "Europe/Rome",
          priority: "medium",
          title: "Media oggi",
        },
      ],
    ] as const;
    for (const [index, [id, values]] of fixtures.entries()) {
      await tasks.create(
        scope,
        id,
        values,
        mutationContext(
          `list-${String(index)}`,
          `tsk_list-token-${String(index)}`,
          clock.now(),
        ),
      );
    }
    await expect(tasks.listOpen(scope, 50)).resolves.toMatchObject([
      { id: "task-high-date" },
      { id: "task-medium-time" },
      { id: "task-low" },
    ]);
    await expect(
      tasks.listForDay(scope, {
        localDate: "2026-08-08",
        startAtUtc: new Date("2026-08-07T22:00:00Z"),
        endAtUtc: new Date("2026-08-08T22:00:00Z"),
      }),
    ).resolves.toMatchObject([
      { id: "task-high-date" },
      { id: "task-medium-time" },
    ]);
  });

  it("uses single-use, expiring and version-checked Undo", async () => {
    await tasks.create(
      scope,
      "task-undo",
      { dueKind: "none", priority: "medium", title: "Undo" },
      mutationContext("undo-create", "tsk_undo-create-token", clock.now()),
    );
    await tasks.complete(
      scope,
      "task-undo",
      mutationContext("undo-complete", "tsk_undo-complete-token", clock.now()),
    );
    await tasks.reopen(
      scope,
      "task-undo",
      mutationContext("make-stale", "tsk_make-stale-token", clock.now()),
    );
    await expect(
      tasks.undo(scope, "tsk_undo-complete-token", {
        actorUserId: scope.userId,
        correlationId: "stale",
        idempotencyKey: "stale",
        auditId: "audit-stale",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "stale" });
    await expect(
      tasks.undo(scope, "tsk_make-stale-token", {
        actorUserId: scope.userId,
        correlationId: "undo-reopen",
        idempotencyKey: "undo-reopen",
        auditId: "audit-undo-reopen",
        now: clock.now(),
      }),
    ).resolves.toMatchObject({
      outcome: "reverted",
      task: { status: "completed", version: 4 },
    });
    await expect(
      tasks.undo(scope, "tsk_make-stale-token", {
        actorUserId: scope.userId,
        correlationId: "replay",
        idempotencyKey: "replay",
        auditId: "audit-replay",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "used" });

    await tasks.create(
      scope,
      "task-expired",
      { dueKind: "none", priority: "low", title: "Scade" },
      mutationContext("expired-create", "tsk_expired-token", clock.now()),
    );
    clock.advance(15 * 60 * 1_000);
    await expect(
      tasks.undo(scope, "tsk_expired-token", {
        actorUserId: scope.userId,
        correlationId: "expired",
        idempotencyKey: "expired",
        auditId: "audit-expired",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "expired" });
  });
});

describe("B3 deterministic Telegram flow", () => {
  beforeEach(resetDatabase);

  it("creates, lists, shows in /oggi, completes, reopens and undoes without AI", async () => {
    const clock = new FakeClock();
    const reply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const tasks = new D1TaskRepository(env.DB);
    const dependencies = testInboundDependencies({
      authorizer: new SelfScopeAuthorizer(),
      clock,
      deliveries: new D1DeliveryRepository(env.DB),
      effects: new D1EffectRepository(env.DB),
      events: new D1EventRepository(env.DB),
      identities: new D1IdentityRepository(env.DB),
      ids: new SequenceIds(),
      inbox,
      preferences: new D1PreferenceRepository(env.DB),
      reminders: new D1ReminderRepository(env.DB),
      tasks,
      reply,
      leaseSeconds: 60,
    });
    const commands = [
      envelope(1101, "/impostazioni imposta it Europe/Rome 24h EUR"),
      envelope(1102, "/task crea 2026-08-08 | alta | Pagare la bolletta"),
      envelope(1103, "/task crea 2026-08-08T17:00 | media | Chiamare Luca"),
      envelope(1104, "/task lista"),
      envelope(1105, "/oggi"),
    ];
    for (const command of commands) {
      await inbox.register(command, clock.now());
      await processInboundMessage(command, dependencies);
    }
    expect(reply.texts[1]).toContain("Task creata.");
    expect(reply.texts[3]).toContain("Pagare la bolletta");
    expect(reply.texts[3]?.indexOf("Pagare la bolletta")).toBeLessThan(
      reply.texts[3]?.indexOf("Chiamare Luca") ?? -1,
    );
    expect(reply.texts[4]).toContain("Task:");
    expect(reply.texts[4]).toContain("Chiamare Luca");

    const taskId = reply.texts[1]?.match(/ID: ([A-Za-z0-9-]+)/u)?.[1];
    if (taskId === undefined) throw new Error("task ID missing");
    for (const command of [
      envelope(1106, `/task completa ${taskId}`),
      envelope(1107, `/task leggi ${taskId}`),
      envelope(1108, `/task riapri ${taskId}`),
    ]) {
      await inbox.register(command, clock.now());
      await processInboundMessage(command, dependencies);
    }
    expect(reply.texts[5]).toContain("Task completata.");
    expect(reply.texts[6]).toContain("Stato: completata");
    expect(reply.texts[7]).toContain("Task riaperta.");
    const undoToken = reply.texts[7]?.match(
      /\/annulla (tsk_[A-Za-z0-9_-]+)/u,
    )?.[1];
    if (undoToken === undefined) throw new Error("task Undo token missing");
    const undo = envelope(1109, `/annulla ${undoToken}`);
    await inbox.register(undo, clock.now());
    await processInboundMessage(undo, dependencies);
    expect(reply.texts[8]).toContain("Modifica task annullata.");
    await expect(
      tasks.get({ userId: "00000000-0000-4000-8000-000000000001" }, taskId),
    ).resolves.toMatchObject({
      status: "completed",
      version: 4,
    });
  });

  it("rejects missing preferences, ambiguous DST and malformed input", async () => {
    const clock = new FakeClock();
    const reply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const dependencies = testInboundDependencies({
      authorizer: new SelfScopeAuthorizer(),
      clock,
      deliveries: new D1DeliveryRepository(env.DB),
      effects: new D1EffectRepository(env.DB),
      events: new D1EventRepository(env.DB),
      identities: new D1IdentityRepository(env.DB),
      ids: new SequenceIds(),
      inbox,
      preferences: new D1PreferenceRepository(env.DB),
      reminders: new D1ReminderRepository(env.DB),
      tasks: new D1TaskRepository(env.DB),
      reply,
      leaseSeconds: 60,
    });
    for (const command of [
      envelope(1120, "/task crea nessuna | media | Senza profilo"),
      envelope(1121, "/impostazioni imposta it Europe/Rome 24h EUR"),
      envelope(1122, "/task crea 2026-10-25T02:30 | alta | Ambigua"),
      envelope(1123, "/task crea 2026-08-08 | media"),
    ]) {
      await inbox.register(command, clock.now());
      await processInboundMessage(command, dependencies);
    }
    expect(reply.texts[0]).toContain("Configura prima la timezone");
    expect(reply.texts[2]).toContain("inesistente o ambigua");
    expect(reply.texts[3]).toContain("/task crea");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM tasks",
    ).first<{ count: number }>();
    expect(count?.count).toBe(0);
  });
});
