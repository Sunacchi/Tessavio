import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { manageEvents } from "../../src/application/manage-events";
import type { EventMutationContext } from "../../src/application/ports/events";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { FakeClock, SequenceIds } from "../helpers";

describe("B1.2 cross-tenant event isolation", () => {
  const clock = new FakeClock();
  let events: D1EventRepository;

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM event_undo_actions"),
      env.DB.prepare("DELETE FROM events"),
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
    events = new D1EventRepository(env.DB);
  });

  it("does not read, list, update, cancel or undo another user's event", async () => {
    const context: EventMutationContext = {
      actorUserId: "user-a",
      provenance: "entered",
      correlationId: "correlation-a",
      idempotencyKey: "create-a",
      auditId: "audit-a",
      undoToken: "evt_user-a-token",
      now: clock.now(),
      undoExpiresAt: new Date(clock.now().getTime() + 900_000),
    };
    await events.create(
      { userId: "user-a" },
      "private-event-a",
      { kind: "date_only", title: "Privato A", localDate: "2026-08-08" },
      context,
    );

    await expect(
      events.get({ userId: "user-b" }, "private-event-a"),
    ).resolves.toBeNull();
    await expect(
      events.listForDay(
        { userId: "user-b" },
        {
          localDate: "2026-08-08",
          startAtUtc: new Date("2026-08-07T22:00:00Z"),
          endAtUtc: new Date("2026-08-08T22:00:00Z"),
        },
      ),
    ).resolves.toEqual([]);
    await expect(
      events.update(
        { userId: "user-b" },
        "private-event-a",
        { kind: "date_only", title: "Intrusione", localDate: "2026-08-09" },
        { ...context, actorUserId: "user-b", idempotencyKey: "update-b" },
      ),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      events.cancel({ userId: "user-b" }, "private-event-a", {
        ...context,
        actorUserId: "user-b",
        idempotencyKey: "cancel-b",
      }),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      events.undo({ userId: "user-b" }, context.undoToken, {
        actorUserId: "user-b",
        correlationId: "undo-b",
        idempotencyKey: "undo-b",
        auditId: "audit-undo-b",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "not_found" });

    await expect(
      manageEvents(
        {
          actorUserId: "user-a",
          scope: { userId: "user-b" },
          correlationId: "cross-tenant-app",
          idempotencyKey: "cross-tenant-app",
          sentAtUnix: clock.now().getTime() / 1_000,
          command: { kind: "events.read", eventId: "private-event-a" },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          clock,
          events,
          ids: new SequenceIds(),
          provenance: "entered",
          preferences: new D1PreferenceRepository(env.DB),
          dayViewContributors: [],
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expect(
      events.get({ userId: "user-a" }, "private-event-a"),
    ).resolves.toMatchObject({
      title: "Privato A",
      status: "active",
      version: 1,
    });
  });
});
