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
  });
});
