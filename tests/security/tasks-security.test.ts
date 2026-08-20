import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { manageTasks } from "../../src/application/manage-tasks";
import type { TaskMutationContext } from "../../src/application/ports/tasks";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1TaskRepository } from "../../src/infrastructure/db/task-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { FakeClock, SequenceIds } from "../helpers";

describe("B3 cross-tenant task isolation", () => {
  const clock = new FakeClock();
  let tasks: D1TaskRepository;

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM task_undo_actions"),
      env.DB.prepare("DELETE FROM tasks"),
      env.DB.prepare("DELETE FROM preference_undo_actions"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind("user-a", clock.now().getTime()),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind("user-b", clock.now().getTime()),
      env.DB.prepare(
        `INSERT INTO user_preferences (
           user_id, language, time_zone, hour_format, default_currency,
           version, last_mutation_key, created_at, updated_at
         ) VALUES (?, 'it', 'Europe/Rome', '24h', 'EUR', 1, ?, ?, ?)`,
      ).bind("user-b", "setup-b", clock.now().getTime(), clock.now().getTime()),
    ]);
    tasks = new D1TaskRepository(env.DB);
  });

  it("does not read, list, complete, reopen or undo another user's task", async () => {
    const context: TaskMutationContext = {
      actorUserId: "user-a",
      correlationId: "correlation-a",
      idempotencyKey: "create-a",
      auditId: "audit-a",
      undoToken: "tsk_user-a-token",
      now: clock.now(),
      undoExpiresAt: new Date(clock.now().getTime() + 900_000),
    };
    await tasks.create(
      { userId: "user-a" },
      "private-task-a",
      {
        dueKind: "date_only",
        dueDateLocal: "2026-08-08",
        priority: "high",
        title: "Privata A",
      },
      context,
    );
    await expect(
      tasks.get({ userId: "user-b" }, "private-task-a"),
    ).resolves.toBeNull();
    await expect(tasks.listOpen({ userId: "user-b" }, 50)).resolves.toEqual([]);
    await expect(
      tasks.listForDay(
        { userId: "user-b" },
        {
          localDate: "2026-08-08",
          startAtUtc: new Date("2026-08-07T22:00:00Z"),
          endAtUtc: new Date("2026-08-08T22:00:00Z"),
        },
      ),
    ).resolves.toEqual([]);
    await expect(
      tasks.complete({ userId: "user-b" }, "private-task-a", {
        ...context,
        actorUserId: "user-b",
        idempotencyKey: "complete-b",
      }),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      tasks.reopen({ userId: "user-b" }, "private-task-a", {
        ...context,
        actorUserId: "user-b",
        idempotencyKey: "reopen-b",
      }),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      tasks.undo({ userId: "user-b" }, context.undoToken, {
        actorUserId: "user-b",
        correlationId: "undo-b",
        idempotencyKey: "undo-b",
        auditId: "audit-undo-b",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      manageTasks(
        {
          actorUserId: "user-a",
          scope: { userId: "user-b" },
          correlationId: "cross-tenant-app",
          idempotencyKey: "cross-tenant-app",
          command: { kind: "tasks.read", taskId: "private-task-a" },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          clock,
          ids: new SequenceIds(),
          preferences: new D1PreferenceRepository(env.DB),
          tasks,
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      tasks.get({ userId: "user-a" }, "private-task-a"),
    ).resolves.toMatchObject({ status: "open", version: 1 });
  });
});
