import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { manageLists } from "../../src/application/manage-lists";
import type { ListMutationContext } from "../../src/application/ports/lists";
import { D1ListRepository } from "../../src/infrastructure/db/list-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { AppError } from "../../src/shared/errors";
import { FakeClock, SequenceIds } from "../helpers";

class GuardedListRepository extends D1ListRepository {
  reads = 0;

  override getList(): ReturnType<D1ListRepository["getList"]> {
    this.reads += 1;
    return Promise.reject(new Error("list read happened before auth"));
  }
}

describe("B6.1 lists and notes isolation", () => {
  const now = new Date("2026-08-19T10:00:00Z");
  let lists: D1ListRepository;
  const context = (user: string, key: string): ListMutationContext => ({
    actorUserId: user,
    correlationId: key,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `lst_${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  });

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM list_undo_actions"),
      env.DB.prepare("DELETE FROM list_items"),
      env.DB.prepare("DELETE FROM notes"),
      env.DB.prepare("DELETE FROM lists"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('a', 'active', ?)",
      ).bind(now.getTime()),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('b', 'active', ?)",
      ).bind(now.getTime()),
    ]);
    lists = new D1ListRepository(env.DB);
  });

  it("denies cross-user reads, parent access, mutations and Undo", async () => {
    await lists.createList(
      { userId: "a" },
      "list-a",
      { title: "Privata" },
      context("a", "create-list-a"),
    );
    await lists.createItem(
      { userId: "a" },
      "item-a",
      "list-a",
      { text: "Segreto" },
      context("a", "create-item-a"),
    );
    await lists.createNote(
      { userId: "a" },
      "note-a",
      { title: "Privata", body: "Contenuto" },
      context("a", "create-note-a"),
    );
    expect(await lists.getList({ userId: "b" }, "list-a")).toBeNull();
    expect(await lists.getNote({ userId: "b" }, "note-a")).toBeNull();
    expect(
      (
        await lists.createItem(
          { userId: "b" },
          "item-b",
          "list-a",
          { text: "Tentativo" },
          context("b", "cross-parent"),
        )
      ).outcome,
    ).toBe("list_not_found");
    expect(
      (
        await lists.renameList(
          { userId: "b" },
          "list-a",
          1,
          { title: "Rubata" },
          context("b", "cross-rename"),
        )
      ).outcome,
    ).toBe("not_found");
    expect(
      await lists.undo({ userId: "b" }, "lst_create-list-a", {
        ...context("b", "cross-undo"),
        now,
      }),
    ).toEqual({ outcome: "not_found" });
    expect(await lists.listLists({ userId: "b" }, 50)).toEqual([]);
    expect(await lists.listNotes({ userId: "b" }, 50)).toEqual([]);
  });

  it("authorizes the actor before touching private content", async () => {
    const guarded = new GuardedListRepository(env.DB);
    await expect(
      manageLists(
        {
          actorUserId: "a",
          scope: { userId: "b" },
          correlationId: "cross-actor",
          idempotencyKey: "cross-actor",
          command: { kind: "lists.read", listId: "list-a" },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          clock: new FakeClock(now),
          ids: new SequenceIds(),
          lists: guarded,
        },
      ),
    ).rejects.toEqual(new AppError("UNAUTHORIZED", false));
    expect(guarded.reads).toBe(0);
  });

  it("enforces bounded content and the tenant-scoped item/list FK in D1", async () => {
    await env.DB.prepare(
      `INSERT INTO lists (
        id,user_id,title,source,status,version,last_mutation_key,
        created_at,updated_at,deleted_at
      ) VALUES ('list-a','a','A','manual_command','active',1,'fixture',?,?,NULL)`,
    )
      .bind(now.getTime(), now.getTime())
      .run();
    await expect(
      env.DB.prepare(
        `INSERT INTO list_items (
          id,user_id,list_id,text,source,status,version,last_mutation_key,
          created_at,updated_at,completed_at,deleted_at
        ) VALUES ('cross','b','list-a','x','manual_command','open',1,'fixture',?,?,NULL,NULL)`,
      )
        .bind(now.getTime(), now.getTime())
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `INSERT INTO notes (
          id,user_id,title,body,source,status,version,last_mutation_key,
          created_at,updated_at,deleted_at
        ) VALUES ('too-long','a','x',?,'manual_command','active',1,'fixture',?,?,NULL)`,
      )
        .bind("x".repeat(4_001), now.getTime(), now.getTime())
        .run(),
    ).rejects.toThrow();
    const recurrenceTables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND lower(name) LIKE '%recurr%'
       ORDER BY name`,
    ).all<{ name: string }>();
    expect(recurrenceTables.results.map((row) => row.name)).toEqual([
      "reminder_recurrence_occurrences",
      "reminder_recurrence_undo_actions",
      "reminder_recurrences",
    ]);
    const futureTables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND (
         lower(name) LIKE '%routine%' OR lower(name) LIKE '%bank%'
         OR lower(name) LIKE '%psd2%'
       )`,
    ).all<{ name: string }>();
    expect(futureTables.results).toEqual([]);
  });
});
