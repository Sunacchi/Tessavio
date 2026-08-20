import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { managePreferences } from "../../src/application/manage-preferences";
import type { PreferenceMutationContext } from "../../src/application/ports/preferences";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { FakeClock, SequenceIds } from "../helpers";

describe("B1.1 cross-tenant isolation", () => {
  const clock = new FakeClock();
  const values = {
    language: "it" as const,
    timeZone: "Europe/Rome",
    hourFormat: "24h" as const,
    defaultCurrency: "EUR",
  };
  let preferences: D1PreferenceRepository;

  beforeEach(async () => {
    await env.DB.batch([
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
    ]);
    preferences = new D1PreferenceRepository(env.DB);
  });

  it("does not read or mutate another user's profile", async () => {
    const context: PreferenceMutationContext = {
      actorUserId: "user-a",
      correlationId: "correlation-a",
      idempotencyKey: "set-a",
      auditId: "audit-a",
      undoToken: "undo-token-user-a",
      now: clock.now(),
      undoExpiresAt: new Date(clock.now().getTime() + 900_000),
    };
    const created = await preferences.set(
      { userId: "user-a" },
      values,
      context,
    );
    if (created.undoToken === null) throw new Error("fixture token missing");

    await expect(preferences.get({ userId: "user-b" })).resolves.toBeNull();
    await expect(
      managePreferences(
        {
          actorUserId: "user-a",
          scope: { userId: "user-b" },
          correlationId: "cross-user-read",
          idempotencyKey: "cross-user-read",
          command: { kind: "preferences.read" },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          clock,
          ids: new SequenceIds(),
          preferences,
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      managePreferences(
        {
          actorUserId: "user-a",
          scope: { userId: "user-b" },
          correlationId: "cross-user-write",
          idempotencyKey: "cross-user-write",
          command: {
            kind: "preferences.set",
            language: "it",
            timeZone: "Asia/Tokyo",
            hourFormat: "24h",
            defaultCurrency: "JPY",
          },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          clock,
          ids: new SequenceIds(),
          preferences,
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      preferences.undo({ userId: "user-b" }, created.undoToken, {
        actorUserId: "user-b",
        correlationId: "cross-user-undo",
        idempotencyKey: "cross-user-undo",
        auditId: "cross-user-undo-audit",
        now: clock.now(),
      }),
    ).resolves.toEqual({ outcome: "not_found" });

    await expect(preferences.get({ userId: "user-a" })).resolves.toEqual(
      created.profile,
    );
    await expect(preferences.get({ userId: "user-b" })).resolves.toBeNull();
  });
});
