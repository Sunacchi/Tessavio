import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1FinanceRepository } from "../../src/infrastructure/db/finance-repository";
import { D1ListRepository } from "../../src/infrastructure/db/list-repository";
import { D1NotificationDeliveryRepository } from "../../src/infrastructure/db/notification-delivery-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1ReminderRecurrenceRepository } from "../../src/infrastructure/db/reminder-recurrence-repository";
import { D1ReminderRepository } from "../../src/infrastructure/db/reminder-repository";
import { D1TaskRepository } from "../../src/infrastructure/db/task-repository";
import { D1WorkRepository } from "../../src/infrastructure/db/work-repository";
import type { UserScope } from "../../src/shared/contracts";
import { FakeClock } from "../helpers";

const scopeA: UserScope = { userId: "retention-user-a" };
const scopeB: UserScope = { userId: "retention-user-b" };
const undoTtlMs = 15 * 60 * 1_000;

type UndoTable =
  | "preference_undo_actions"
  | "event_undo_actions"
  | "task_undo_actions"
  | "reminder_undo_actions"
  | "reminder_recurrence_undo_actions"
  | "work_undo_actions"
  | "finance_undo_actions"
  | "list_undo_actions";

interface UndoStore {
  readonly table: UndoTable;
  readonly purge: (
    scope: UserScope,
    before: Date,
    limit: number,
  ) => Promise<number>;
}

async function insertUndo(
  table: UndoTable,
  scope: UserScope,
  suffix: string,
  expiresAt: Date,
): Promise<void> {
  const token = `${table}-${scope.userId}-${suffix}`;
  const source = `source-${token}`;
  const createdAt = expiresAt.getTime() - undoTtlMs;
  if (table === "preference_undo_actions") {
    await env.DB.prepare(
      `INSERT INTO preference_undo_actions (
        token, scope_user_id, source_idempotency_key, before_json,
        expected_version, expires_at, consumed_at,
        consumed_by_idempotency_key, created_at
      ) VALUES (?, ?, ?, NULL, 1, ?, NULL, NULL, ?)`,
    )
      .bind(token, scope.userId, source, expiresAt.getTime(), createdAt)
      .run();
    return;
  }
  if (table === "work_undo_actions") {
    await env.DB.prepare(
      `INSERT INTO work_undo_actions (
        token, scope_user_id, entity_kind, entity_id,
        source_idempotency_key, expected_version, expires_at, consumed_at,
        consumed_by_idempotency_key, created_at
      ) VALUES (?, ?, 'rule', ?, ?, 1, ?, NULL, NULL, ?)`,
    )
      .bind(
        token,
        scope.userId,
        `entity-${suffix}`,
        source,
        expiresAt.getTime(),
        createdAt,
      )
      .run();
    return;
  }
  if (table === "list_undo_actions") {
    await env.DB.prepare(
      `INSERT INTO list_undo_actions (
        token, scope_user_id, entity_kind, entity_id,
        source_idempotency_key, before_json, expected_version, expires_at,
        consumed_at, consumed_by_idempotency_key, created_at
      ) VALUES (?, ?, 'note', ?, ?, NULL, 1, ?, NULL, NULL, ?)`,
    )
      .bind(
        token,
        scope.userId,
        `entity-${suffix}`,
        source,
        expiresAt.getTime(),
        createdAt,
      )
      .run();
    return;
  }
  const entityColumn: Record<
    Exclude<
      UndoTable,
      "preference_undo_actions" | "work_undo_actions" | "list_undo_actions"
    >,
    string
  > = {
    event_undo_actions: "event_id",
    task_undo_actions: "task_id",
    reminder_undo_actions: "reminder_id",
    reminder_recurrence_undo_actions: "recurrence_id",
    finance_undo_actions: "entry_id",
  };
  await env.DB.prepare(
    `INSERT INTO ${table} (
      token, scope_user_id, ${entityColumn[table]}, source_idempotency_key,
      before_json, expected_version, expires_at, consumed_at,
      consumed_by_idempotency_key, created_at
    ) VALUES (?, ?, ?, ?, NULL, 1, ?, NULL, NULL, ?)`,
  )
    .bind(
      token,
      scope.userId,
      `entity-${suffix}`,
      source,
      expiresAt.getTime(),
      createdAt,
    )
    .run();
}

describe("Phase B retention gate", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notification_deliveries"),
      env.DB.prepare("DELETE FROM list_undo_actions"),
      env.DB.prepare("DELETE FROM finance_undo_actions"),
      env.DB.prepare("DELETE FROM work_undo_actions"),
      env.DB.prepare("DELETE FROM reminder_recurrence_undo_actions"),
      env.DB.prepare("DELETE FROM reminder_undo_actions"),
      env.DB.prepare("DELETE FROM task_undo_actions"),
      env.DB.prepare("DELETE FROM event_undo_actions"),
      env.DB.prepare("DELETE FROM preference_undo_actions"),
      env.DB.prepare("DELETE FROM users"),
    ]);
    const now = new Date("2026-08-19T08:00:00Z").getTime();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(scopeA.userId, now),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(scopeB.userId, now),
    ]);
  });

  it("purges every expired Phase B Undo category with fake-clock, tenant isolation and replay safety", async () => {
    const clock = new FakeClock(new Date("2026-08-19T08:00:00Z"));
    const stores: readonly UndoStore[] = [
      {
        table: "preference_undo_actions",
        purge: (scope, before, limit) =>
          new D1PreferenceRepository(env.DB).purgeExpiredUndo(
            scope,
            before,
            limit,
          ),
      },
      {
        table: "event_undo_actions",
        purge: (scope, before, limit) =>
          new D1EventRepository(env.DB).purgeExpiredUndo(scope, before, limit),
      },
      {
        table: "task_undo_actions",
        purge: (scope, before, limit) =>
          new D1TaskRepository(env.DB).purgeExpiredUndo(scope, before, limit),
      },
      {
        table: "reminder_undo_actions",
        purge: (scope, before, limit) =>
          new D1ReminderRepository(env.DB).purgeExpiredUndo(
            scope,
            before,
            limit,
          ),
      },
      {
        table: "reminder_recurrence_undo_actions",
        purge: (scope, before, limit) =>
          new D1ReminderRecurrenceRepository(env.DB).purgeExpiredUndo(
            scope,
            before,
            limit,
          ),
      },
      {
        table: "work_undo_actions",
        purge: (scope, before, limit) =>
          new D1WorkRepository(env.DB).purgeExpiredUndo(scope, before, limit),
      },
      {
        table: "finance_undo_actions",
        purge: (scope, before, limit) =>
          new D1FinanceRepository(env.DB).purgeExpiredUndo(
            scope,
            before,
            limit,
          ),
      },
      {
        table: "list_undo_actions",
        purge: (scope, before, limit) =>
          new D1ListRepository(env.DB).purgeExpiredUndo(scope, before, limit),
      },
    ];

    for (const store of stores) {
      await insertUndo(
        store.table,
        scopeA,
        "expired",
        new Date(clock.now().getTime() + undoTtlMs),
      );
      await insertUndo(
        store.table,
        scopeA,
        "future",
        new Date(clock.now().getTime() + 2 * undoTtlMs),
      );
      await insertUndo(
        store.table,
        scopeB,
        "expired",
        new Date(clock.now().getTime() + undoTtlMs),
      );
    }
    clock.advance(undoTtlMs);

    for (const store of stores) {
      await expect(store.purge(scopeA, clock.now(), 100)).resolves.toBe(1);
      await expect(store.purge(scopeA, clock.now(), 100)).resolves.toBe(0);
      const rows = await env.DB.prepare(
        `SELECT scope_user_id, COUNT(*) AS count FROM ${store.table}
         GROUP BY scope_user_id ORDER BY scope_user_id`,
      ).all<{ scope_user_id: string; count: number }>();
      expect(rows.results).toEqual([
        { scope_user_id: scopeA.userId, count: 1 },
        { scope_user_id: scopeB.userId, count: 1 },
      ]);
    }
  });

  it("retains active delivery attempts and purges only old terminal rows in one tenant", async () => {
    const clock = new FakeClock(new Date("2026-07-01T08:00:00Z"));
    const deliveries = new D1NotificationDeliveryRepository(env.DB);
    await deliveries.prepare(
      scopeA,
      "delivery-a-old",
      "reminder-a-old",
      "job-a-old",
      clock.now(),
    );
    await deliveries.markSent(
      scopeA,
      "delivery-a-old",
      "remote-a-old",
      clock.now(),
    );
    await deliveries.prepare(
      scopeA,
      "delivery-a-pending",
      "reminder-a-pending",
      "job-a-pending",
      clock.now(),
    );
    await deliveries.prepare(
      scopeB,
      "delivery-b-old",
      "reminder-b-old",
      "job-b-old",
      clock.now(),
    );
    await deliveries.markSent(
      scopeB,
      "delivery-b-old",
      "remote-b-old",
      clock.now(),
    );

    clock.advance(31 * 24 * 60 * 60 * 1_000);
    await deliveries.prepare(
      scopeA,
      "delivery-a-fresh",
      "reminder-a-fresh",
      "job-a-fresh",
      clock.now(),
    );
    await deliveries.markSent(
      scopeA,
      "delivery-a-fresh",
      "remote-a-fresh",
      clock.now(),
    );
    const before = new Date(clock.now().getTime() - 30 * 24 * 60 * 60 * 1_000);

    await expect(deliveries.purgeTerminal(scopeA, before, 100)).resolves.toBe(
      1,
    );
    await expect(deliveries.purgeTerminal(scopeA, before, 100)).resolves.toBe(
      0,
    );
    const rows = await env.DB.prepare(
      `SELECT dedupe_key, scope_user_id, status FROM notification_deliveries
       ORDER BY dedupe_key`,
    ).all<{ dedupe_key: string; scope_user_id: string; status: string }>();
    expect(rows.results).toEqual([
      {
        dedupe_key: "delivery-a-fresh",
        scope_user_id: scopeA.userId,
        status: "sent",
      },
      {
        dedupe_key: "delivery-a-pending",
        scope_user_id: scopeA.userId,
        status: "pending",
      },
      {
        dedupe_key: "delivery-b-old",
        scope_user_id: scopeB.userId,
        status: "sent",
      },
    ]);
  });
});
