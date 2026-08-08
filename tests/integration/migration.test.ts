import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("foundation migration", () => {
  it("creates the expected tables and uses the recovery index", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = tables.results.map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "users",
        "telegram_identities",
        "inbound_updates",
        "effects",
        "deliveries",
        "audit_log",
        "user_preferences",
        "preference_undo_actions",
        "events",
        "event_undo_actions",
      ]),
    );

    const plan = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT update_id FROM inbound_updates WHERE status = ? ORDER BY updated_at LIMIT 10",
    )
      .bind("pending_enqueue")
      .all<{ detail: string }>();
    expect(
      plan.results.some((row) =>
        row.detail.includes("inbound_updates_recovery_idx"),
      ),
    ).toBe(true);

    const preferencePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT language, time_zone, hour_format, default_currency, version
       FROM user_preferences WHERE user_id = ?`,
    )
      .bind("user-a")
      .all<{ detail: string }>();
    expect(
      preferencePlan.results.some((row) =>
        row.detail.includes("sqlite_autoindex_user_preferences_1"),
      ),
    ).toBe(true);

    const purgePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT token FROM preference_undo_actions
       WHERE scope_user_id = ? AND expires_at <= ?
       ORDER BY expires_at LIMIT 100`,
    )
      .bind("user-a", Date.now())
      .all<{ detail: string }>();
    expect(
      purgePlan.results.some((row) =>
        row.detail.includes("preference_undo_scope_expiry_idx"),
      ),
    ).toBe(true);

    const eventDatePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM events
       WHERE user_id = ? AND status = 'active' AND local_date = ?`,
    )
      .bind("user-a", "2026-08-08")
      .all<{ detail: string }>();
    expect(
      eventDatePlan.results.some((row) =>
        row.detail.includes("events_scope_date_idx"),
      ),
    ).toBe(true);

    const eventInstantPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM events
       WHERE user_id = ? AND status = 'active'
         AND start_at_utc < ? AND end_at_utc > ?`,
    )
      .bind("user-a", Date.now() + 86_400_000, Date.now())
      .all<{ detail: string }>();
    expect(
      eventInstantPlan.results.some((row) =>
        row.detail.includes("events_scope_instant_idx"),
      ),
    ).toBe(true);

    const eventPurgePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT token FROM event_undo_actions
       WHERE scope_user_id = ? AND expires_at <= ?
       ORDER BY expires_at LIMIT 100`,
    )
      .bind("user-a", Date.now())
      .all<{ detail: string }>();
    expect(
      eventPurgePlan.results.some((row) =>
        row.detail.includes("event_undo_scope_expiry_idx"),
      ),
    ).toBe(true);
  });
});
