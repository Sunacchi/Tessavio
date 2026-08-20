import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { manageEvents } from "../../src/application/manage-events";
import {
  manageWork,
  workDayViewContributor,
} from "../../src/application/manage-work";
import type { WorkMutationContext } from "../../src/application/ports/work";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1WorkRepository } from "../../src/infrastructure/db/work-repository";
import {
  SelfScopeAuthorizer,
  type Authorizer,
} from "../../src/security/authorization";
import { AppError } from "../../src/shared/errors";
import { FakeClock, SequenceIds } from "../helpers";

class GuardedWorkRepository extends D1WorkRepository {
  workReadCalls = 0;

  override listForDay(): ReturnType<D1WorkRepository["listForDay"]> {
    this.workReadCalls += 1;
    return Promise.reject(new Error("work read happened too early"));
  }
}

describe("B4 work isolation", () => {
  const now = new Date("2026-08-08T10:00:00Z");
  let work: D1WorkRepository;
  const context = (user: string, key: string): WorkMutationContext => ({
    actorUserId: user,
    correlationId: key,
    idempotencyKey: key,
    auditId: `audit-${key}`,
    undoToken: `wrk_${key}`,
    now,
    undoExpiresAt: new Date(now.getTime() + 900_000),
  });
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM work_undo_actions"),
      env.DB.prepare("DELETE FROM work_breaks"),
      env.DB.prepare("DELETE FROM work_logs"),
      env.DB.prepare("DELETE FROM planned_shifts"),
      env.DB.prepare("DELETE FROM work_rules"),
      env.DB.prepare("DELETE FROM audit_log"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('a', 'active', ?)",
      ).bind(now.getTime()),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('b', 'active', ?)",
      ).bind(now.getTime()),
    ]);
    work = new D1WorkRepository(env.DB);
  });
  it("denies cross-user reads, links and undo", async () => {
    await work.createRule(
      { userId: "a" },
      "rule-a",
      { name: "Privata", breakTreatment: "paid" },
      context("a", "rule-a"),
    );
    expect(await work.getRule({ userId: "b" }, "rule-a")).toBeNull();
    expect(
      (
        await work.createLog(
          { userId: "b" },
          "log-b",
          "rule-a",
          {
            title: "Forgery",
            startAtUtc: new Date("2026-08-08T08:00:00Z"),
            endAtUtc: new Date("2026-08-08T09:00:00Z"),
            originalTimeZone: "UTC",
          },
          context("b", "log-b"),
        )
      ).outcome,
    ).toBe("rule_not_found");
    expect(
      await work.undo({ userId: "b" }, "wrk_rule-a", {
        ...context("b", "undo-b"),
        now,
      }),
    ).toEqual({ outcome: "not_found" });
    await expect(
      env.DB.prepare(
        `INSERT INTO work_logs (id,user_id,title,start_at_utc,end_at_utc,original_time_zone,rule_id,rule_version,rule_name,break_treatment,version,last_mutation_key,created_at,updated_at) VALUES ('forged','b','x',1,2,'UTC','rule-a',1,'x','paid',1,'x',1,1)`,
      ).run(),
    ).rejects.toThrow();
  });

  it("authorizes the actor before application-layer work reads", async () => {
    await expect(
      manageWork(
        {
          actorUserId: "a",
          scope: { userId: "b" },
          correlationId: "cross-actor",
          idempotencyKey: "cross-actor",
          command: { kind: "work.rule.list" },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          clock: new FakeClock(now),
          ids: new SequenceIds(),
          preferences: new D1PreferenceRepository(env.DB),
          work,
        },
      ),
    ).rejects.toEqual(new AppError("UNAUTHORIZED", false));
  });

  it("requires the work capability before /oggi reads planned shifts", async () => {
    await env.DB.prepare(
      `INSERT INTO user_preferences (
        user_id, language, time_zone, hour_format, default_currency,
        quiet_hours_start_minute, quiet_hours_end_minute, version,
        last_mutation_key, created_at, updated_at
      ) VALUES ('a', 'it', 'UTC', '24h', 'EUR', NULL, NULL, 1, 'fixture', ?, ?)`,
    )
      .bind(now.getTime(), now.getTime())
      .run();
    const guardedWork = new GuardedWorkRepository(env.DB);
    const authorizer: Authorizer = {
      authorize(request) {
        return request.action === "work:read"
          ? Promise.reject(new AppError("UNAUTHORIZED", false))
          : Promise.resolve();
      },
    };
    await expect(
      manageEvents(
        {
          actorUserId: "a",
          scope: { userId: "a" },
          correlationId: "today-capability",
          idempotencyKey: "today-capability",
          sentAtUnix: Math.floor(now.getTime() / 1_000),
          command: { kind: "events.today" },
        },
        {
          authorizer,
          clock: new FakeClock(now),
          events: new D1EventRepository(env.DB),
          ids: new SequenceIds(),
          provenance: "entered",
          preferences: new D1PreferenceRepository(env.DB),
          dayViewContributors: [
            workDayViewContributor({ authorizer, work: guardedWork }),
          ],
        },
      ),
    ).rejects.toEqual(new AppError("UNAUTHORIZED", false));
    expect(guardedWork.workReadCalls).toBe(0);
  });
});
