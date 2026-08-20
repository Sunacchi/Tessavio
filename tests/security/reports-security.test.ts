import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { manageReports } from "../../src/application/manage-reports";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1FinanceRepository } from "../../src/infrastructure/db/finance-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1TaskRepository } from "../../src/infrastructure/db/task-repository";
import { D1WorkRepository } from "../../src/infrastructure/db/work-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";

describe("B7 report authorization", () => {
  it("rejects a cross-user report before reading any contributor", async () => {
    await expect(
      manageReports(
        {
          actorUserId: "attacker",
          scope: { userId: "victim" },
          command: {
            kind: "reports.summary",
            startDate: "2026-08-01",
            endDate: "2026-08-31",
          },
        },
        {
          authorizer: new SelfScopeAuthorizer(),
          events: new D1EventRepository(env.DB),
          finance: new D1FinanceRepository(env.DB),
          preferences: new D1PreferenceRepository(env.DB),
          tasks: new D1TaskRepository(env.DB),
          work: new D1WorkRepository(env.DB),
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", retryable: false });
  });
});
