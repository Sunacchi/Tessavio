import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { manageFinance } from "../../src/application/manage-finance";
import type { FinanceMutationContext } from "../../src/application/ports/finance";
import { D1FinanceRepository } from "../../src/infrastructure/db/finance-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { AppError } from "../../src/shared/errors";
import { FakeClock, SequenceIds } from "../helpers";

class GuardedFinanceRepository extends D1FinanceRepository {
  reads = 0;

  override get(): ReturnType<D1FinanceRepository["get"]> {
    this.reads += 1;
    return Promise.reject(new Error("finance read happened before auth"));
  }
}

describe("B5 finance isolation", () => {
  const now = new Date("2026-08-08T10:00:00Z");
  let finance: D1FinanceRepository;
  const context = (user: string, key: string): FinanceMutationContext => ({
    actorUserId: user,
    provenance: "entered",
    correlationId: key,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `fin_${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  });
  const values = {
    kind: "expense" as const,
    amountMinor: 100,
    currency: "EUR",
    localDate: "2026-08-08",
    category: "Privata",
    merchant: null,
    paymentMethod: null,
    note: null,
  };

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM finance_undo_actions"),
      env.DB.prepare("DELETE FROM finance_entries"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('a', 'active', ?)",
      ).bind(now.getTime()),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('b', 'active', ?)",
      ).bind(now.getTime()),
    ]);
    finance = new D1FinanceRepository(env.DB);
  });

  it("denies cross-user read, mutation, totals and Undo by scope", async () => {
    await finance.create(
      { userId: "a" },
      "entry-a",
      values,
      context("a", "create-a"),
    );
    expect(await finance.get({ userId: "b" }, "entry-a")).toBeNull();
    expect(
      (
        await finance.update(
          { userId: "b" },
          "entry-a",
          1,
          { ...values, amountMinor: 999 },
          context("b", "update-b"),
        )
      ).outcome,
    ).toBe("not_found");
    expect(
      (
        await finance.delete(
          { userId: "b" },
          "entry-a",
          1,
          context("b", "delete-b"),
        )
      ).outcome,
    ).toBe("not_found");
    expect(
      await finance.undo({ userId: "b" }, "fin_create-a", {
        ...context("b", "undo-b"),
        now,
      }),
    ).toEqual({ outcome: "not_found" });
    expect(
      await finance.totals(
        { userId: "b" },
        { startDate: "2026-08-01", endDate: "2026-08-31", civilDayCount: 31 },
      ),
    ).toEqual([]);
  });

  it("authorizes the actor before touching economic data", async () => {
    const guarded = new GuardedFinanceRepository(env.DB);
    await expect(
      manageFinance(
        {
          actorUserId: "a",
          scope: { userId: "b" },
          correlationId: "cross-actor",
          idempotencyKey: "cross-actor",
          command: { kind: "finance.read", entryId: "entry-a" },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          clock: new FakeClock(now),
          finance: guarded,
          ids: new SequenceIds(),
          provenance: "entered" as const,
        },
      ),
    ).rejects.toEqual(new AppError("UNAUTHORIZED", false));
    expect(guarded.reads).toBe(0);
  });

  it("enforces money, currency and privacy-shape constraints in D1", async () => {
    const insert = (id: string, amount: number, currency: string) =>
      env.DB.prepare(
        `INSERT INTO finance_entries (
          id,user_id,entry_kind,amount_minor,currency,local_date,category,
          merchant,payment_method,note,source,status,version,last_mutation_key,
          created_at,updated_at,deleted_at
        ) VALUES (?, 'a', 'expense', ?, ?, '2026-08-08', 'x', NULL, NULL,
          NULL, 'manual_command', 'active', 1, ?, ?, ?, NULL)`,
      )
        .bind(id, amount, currency, id, now.getTime(), now.getTime())
        .run();
    await expect(insert("zero", 0, "EUR")).rejects.toThrow();
    await expect(insert("bad-currency", 1, "EURO")).rejects.toThrow();
    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND (
         lower(name) LIKE '%bank%' OR lower(name) LIKE '%psd2%'
         OR lower(name) LIKE '%aisp%' OR lower(name) LIKE '%pisp%'
       )`,
    ).all<{ name: string }>();
    expect(tables.results).toEqual([]);
  });
});
