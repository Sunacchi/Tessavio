import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { manageReminderRecurrences } from "../../src/application/manage-reminder-recurrences";
import type { ReminderRecurrenceMutationContext } from "../../src/application/ports/recurrences";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1ReminderRecurrenceRepository } from "../../src/infrastructure/db/reminder-recurrence-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import type { UserScope } from "../../src/shared/contracts";
import { FakeClock, SequenceIds } from "../helpers";

const userA: UserScope = { userId: "recurrence-security-a" };
const userB: UserScope = { userId: "recurrence-security-b" };
const now = new Date("2026-08-19T08:00:00Z");

function context(
  scope: UserScope,
  key: string,
  token: string,
): ReminderRecurrenceMutationContext {
  return {
    actorUserId: scope.userId,
    provenance: "entered",
    correlationId: `correlation-${key}`,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: token,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  };
}

describe("B6.2 recurring reminder security", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notification_deliveries"),
      env.DB.prepare("DELETE FROM reminder_recurrence_occurrences"),
      env.DB.prepare("DELETE FROM reminder_recurrence_undo_actions"),
      env.DB.prepare("DELETE FROM reminder_undo_actions"),
      env.DB.prepare("DELETE FROM reminders"),
      env.DB.prepare("DELETE FROM reminder_recurrences"),
      env.DB.prepare("DELETE FROM preference_undo_actions"),
      env.DB.prepare("DELETE FROM user_preferences"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM users"),
    ]);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(userA.userId, now.getTime()),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(userB.userId, now.getTime()),
    ]);
  });

  it("never reads, cancels, lists or undoes another user's recurrence", async () => {
    const repository = new D1ReminderRecurrenceRepository(env.DB);
    const created = await repository.create(
      userA,
      "private-recurrence-a",
      {
        text: "Privata A",
        frequency: "daily",
        localTime: "09:00",
        timeZone: "Europe/Rome",
        nextLocalDate: "2026-08-20",
        nextDueAtUtc: new Date("2026-08-20T07:00:00Z"),
      },
      context(userA, "create-private-recurrence", "rec_private-token"),
    );
    if (!("recurrence" in created) || created.undoToken === null) {
      throw new Error("missing recurrence fixture");
    }
    await expect(
      repository.get(userB, "private-recurrence-a"),
    ).resolves.toBeNull();
    await expect(repository.listActive(userB, 50)).resolves.toEqual([]);
    await expect(
      repository.cancel(
        userB,
        "private-recurrence-a",
        1,
        context(userB, "forged-cancel", "rec_forged-cancel"),
      ),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      repository.undo(userB, created.undoToken, {
        actorUserId: userB.userId,
        correlationId: "forged-undo-correlation",
        idempotencyKey: "forged-recurrence-undo",
        auditId: "audit-forged-recurrence-undo",
        now,
      }),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      repository.get(userA, "private-recurrence-a"),
    ).resolves.toMatchObject({ text: "Privata A", status: "active" });
  });

  it("authorizes before reading recurrence or preferences", async () => {
    await expect(
      manageReminderRecurrences(
        {
          actorUserId: userB.userId,
          scope: userA,
          correlationId: "forged-read-correlation",
          idempotencyKey: "forged-read",
          sentAtUnix: Math.floor(now.getTime() / 1_000),
          command: {
            kind: "reminders.recurrence.read",
            recurrenceId: "private-recurrence-a",
          },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          clock: new FakeClock(now),
          ids: new SequenceIds(),
          provenance: "entered",
          preferences: new D1PreferenceRepository(env.DB),
          recurrences: new D1ReminderRecurrenceRepository(env.DB),
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("enforces same-scope recurrence and reminder parents in D1", async () => {
    const timestamp = now.getTime();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO reminder_recurrences (
          id,user_id,text,frequency,local_time,time_zone,next_local_date,
          next_due_at_utc,status,version,last_mutation_key,created_at,updated_at
        ) VALUES ('parent-a',?,'A','daily','09:00','Europe/Rome','2026-08-20',?,
          'active',1,'fixture-a',?,?)`,
      ).bind(userA.userId, timestamp, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO reminders (
          id,user_id,text,requested_at_utc,due_at_utc,original_time_zone,status,
          version,last_mutation_key,created_at,updated_at
        ) VALUES ('reminder-b',?,'B',?,?,'Europe/Rome','pending',1,'fixture-b',?,?)`,
      ).bind(userB.userId, timestamp, timestamp, timestamp, timestamp),
    ]);
    await expect(
      env.DB.prepare(
        `INSERT INTO reminder_recurrence_occurrences (
          reminder_id,user_id,recurrence_id,scheduled_local,due_at_utc,source,created_at
        ) VALUES ('reminder-b',?,'parent-a','2026-08-20T09:00',?,
          'calculated_recurrence',?)`,
      )
        .bind(userB.userId, timestamp, timestamp)
        .run(),
    ).rejects.toThrow();
  });

  it("Cron discovery exposes identifiers only, never recurrence content", async () => {
    const repository = new D1ReminderRecurrenceRepository(env.DB);
    await repository.create(
      userA,
      "due-private",
      {
        text: "Non deve uscire dalla discovery",
        frequency: "daily",
        localTime: "09:00",
        timeZone: "Europe/Rome",
        nextLocalDate: "2026-08-19",
        nextDueAtUtc: now,
      },
      context(userA, "create-due-private", "rec_due-private"),
    );
    const [candidate] = await repository.listDueCandidates(now, 10);
    expect(candidate).toEqual({
      scope: userA,
      recurrenceId: "due-private",
    });
    expect(candidate).not.toHaveProperty("text");
  });
});
