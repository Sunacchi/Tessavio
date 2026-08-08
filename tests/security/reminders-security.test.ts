import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReminderMutationContext } from "../../src/application/ports";
import { D1ReminderRepository } from "../../src/infrastructure/db/reminder-repository";
import type { UserScope } from "../../src/shared/contracts";

const userA: UserScope = { userId: "user-a" };
const userB: UserScope = { userId: "user-b" };

function context(
  scope: UserScope,
  key: string,
  token: string,
): ReminderMutationContext {
  const now = new Date("2026-08-08T08:00:00Z");
  return {
    actorUserId: scope.userId,
    correlationId: `correlation-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: token,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  };
}

describe("B2 cross-tenant reminder isolation", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notification_deliveries"),
      env.DB.prepare("DELETE FROM reminder_undo_actions"),
      env.DB.prepare("DELETE FROM reminders"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM users"),
    ]);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(userA.userId, Date.now()),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(userB.userId, Date.now()),
    ]);
  });

  it("never reads, cancels, lists or undoes another user's reminder", async () => {
    const reminders = new D1ReminderRepository(env.DB);
    const created = await reminders.create(
      userA,
      "private-reminder-a",
      {
        text: "Privato A",
        requestedAtUtc: new Date("2026-08-08T12:00:00Z"),
        originalTimeZone: "Europe/Rome",
      },
      context(userA, "create-a", "rem_private-a-token"),
    );
    if (!("reminder" in created) || created.undoToken === null) {
      throw new Error("missing reminder fixture");
    }
    await expect(
      reminders.get(userB, "private-reminder-a"),
    ).resolves.toBeNull();
    await expect(reminders.listPending(userB, 50)).resolves.toEqual([]);
    await expect(
      reminders.cancel(
        userB,
        "private-reminder-a",
        context(userB, "cancel-forged", "rem_cancel-forged-token"),
      ),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      reminders.undo(userB, created.undoToken, {
        actorUserId: userB.userId,
        correlationId: "correlation-forged-undo",
        idempotencyKey: "forged-undo",
        auditId: "audit-forged-undo",
        now: new Date("2026-08-08T08:00:00Z"),
      }),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      reminders.get(userA, "private-reminder-a"),
    ).resolves.toMatchObject({ text: "Privato A", status: "pending" });
  });
});
