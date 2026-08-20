import { env } from "cloudflare:workers";
import { createMessageBatch } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { manageEvents } from "../../src/application/manage-events";
import {
  manageWork,
  workDayViewContributor,
} from "../../src/application/manage-work";
import type {
  TelegramReplyPort,
  WorkMutationContext,
} from "../../src/application/ports";
import type { InboundMessageEnvelope } from "../../src/application/queue-envelope";
import { processInboundMessage } from "../../src/application/process-inbound";
import { workReportWindow } from "../../src/domains/work/work";
import { handleInboundQueue } from "../../src/entrypoints/queue";
import { D1DeliveryRepository } from "../../src/infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../../src/infrastructure/db/effect-repository";
import { D1EventRepository } from "../../src/infrastructure/db/event-repository";
import { D1IdentityRepository } from "../../src/infrastructure/db/identity-repository";
import { D1InboundRepository } from "../../src/infrastructure/db/inbound-repository";
import { D1PreferenceRepository } from "../../src/infrastructure/db/preference-repository";
import { D1ReminderRepository } from "../../src/infrastructure/db/reminder-repository";
import { D1TaskRepository } from "../../src/infrastructure/db/task-repository";
import { D1WorkRepository } from "../../src/infrastructure/db/work-repository";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { AppError } from "../../src/shared/errors";
import { FakeClock, SequenceIds, testInboundDependencies } from "../helpers";

class CapturingReply implements TelegramReplyPort {
  readonly texts: string[] = [];

  send(_chatId: number, text: string): Promise<{ readonly messageId: string }> {
    this.texts.push(text);
    return Promise.resolve({ messageId: String(this.texts.length) });
  }
}

class RetryOnceReply implements TelegramReplyPort {
  calls = 0;
  successfulCalls = 0;

  send(): Promise<{ readonly messageId: string }> {
    this.calls += 1;
    if (this.calls === 1) {
      return Promise.reject(new AppError("RETRYABLE_EXTERNAL", true));
    }
    this.successfulCalls += 1;
    return Promise.resolve({ messageId: "work-retry-success" });
  }
}

function envelope(updateId: number, text: string): InboundMessageEnvelope {
  const suffix = String(updateId).padStart(12, "0");
  return {
    version: 1,
    type: "INBOUND_MESSAGE",
    jobId: `10000000-0000-4000-8000-${suffix}`,
    correlationId: `10000000-0000-4000-9000-${suffix}`,
    idempotencyKey: `telegram-update:${String(updateId)}`,
    createdAt: "2026-08-08T10:00:00.000Z",
    attempt: 0,
    payload: {
      updateId,
      message: {
        messageId: updateId,
        sentAtUnix: Date.parse("2026-08-08T10:00:00Z") / 1_000,
        sender: { id: 8401, isBot: false },
        chat: { id: 8401, type: "private" },
        text,
      },
    },
  };
}

describe("B4 work flow", () => {
  const now = new Date("2026-08-08T10:00:00Z");
  const scope = { userId: "work-user" };
  let work: D1WorkRepository;
  const context = (key: string): WorkMutationContext => ({
    actorUserId: scope.userId,
    correlationId: `corr-${key}`,
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
      env.DB.prepare("DELETE FROM deliveries"),
      env.DB.prepare("DELETE FROM effects"),
      env.DB.prepare("DELETE FROM telegram_identities"),
      env.DB.prepare("DELETE FROM inbound_updates"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES (?, 'active', ?)",
      ).bind(scope.userId, now.getTime()),
    ]);
    work = new D1WorkRepository(env.DB);
  });

  it("creates idempotently, snapshots a rule, reports and protects referenced undo", async () => {
    const rule = await work.createRule(
      scope,
      "rule-1",
      { name: "Standard", breakTreatment: "unpaid" },
      context("rule"),
    );
    expect(rule.outcome).toBe("created");
    expect(
      (
        await work.createRule(
          scope,
          "ignored",
          { name: "Ignored", breakTreatment: "paid" },
          context("rule"),
        )
      ).outcome,
    ).toBe("duplicate");
    await work.createShift(
      scope,
      "shift-1",
      {
        title: "Turno",
        startAtUtc: new Date("2026-08-08T08:00:00Z"),
        endAtUtc: new Date("2026-08-08T16:00:00Z"),
        originalTimeZone: "UTC",
      },
      context("shift"),
    );
    await work.createLog(
      scope,
      "log-1",
      "rule-1",
      {
        title: "Fatto",
        startAtUtc: new Date("2026-08-08T08:00:00Z"),
        endAtUtc: new Date("2026-08-08T16:00:00Z"),
        originalTimeZone: "UTC",
      },
      context("log"),
    );
    await work.createBreak(
      scope,
      "break-1",
      "log-1",
      {
        startAtUtc: new Date("2026-08-08T12:00:00Z"),
        endAtUtc: new Date("2026-08-08T12:30:00Z"),
        originalTimeZone: "UTC",
      },
      context("break"),
    );
    expect(
      (
        await work.createBreak(
          scope,
          "break-2",
          "log-1",
          {
            startAtUtc: new Date("2026-08-08T12:30:00Z"),
            endAtUtc: new Date("2026-08-08T12:45:00Z"),
            originalTimeZone: "UTC",
          },
          context("break-touch"),
        )
      ).outcome,
    ).toBe("created");
    const window = workReportWindow({
      startDate: "2026-08-08",
      endDate: "2026-08-08",
      timeZone: "UTC",
    });
    if (!window.ok) throw new Error("window");
    expect((await work.report(scope, window.value))?.totals).toEqual({
      scheduledMinutes: 480,
      actualGrossMinutes: 480,
      breakMinutes: 45,
      countedMinutes: 435,
    });
    await work.createLog(
      scope,
      "log-boundary",
      "rule-1",
      {
        title: "Confini",
        startAtUtc: new Date("2026-08-09T08:00:00Z"),
        endAtUtc: new Date("2026-08-09T09:00:00Z"),
        originalTimeZone: "UTC",
      },
      context("log-boundary"),
    );
    expect(
      (
        await work.createBreak(
          scope,
          "break-at-start",
          "log-boundary",
          {
            startAtUtc: new Date("2026-08-09T08:00:00Z"),
            endAtUtc: new Date("2026-08-09T08:15:00Z"),
            originalTimeZone: "UTC",
          },
          context("break-at-start"),
        )
      ).outcome,
    ).toBe("created");
    expect(
      (
        await work.createBreak(
          scope,
          "break-at-end",
          "log-boundary",
          {
            startAtUtc: new Date("2026-08-09T08:45:00Z"),
            endAtUtc: new Date("2026-08-09T09:00:00Z"),
            originalTimeZone: "UTC",
          },
          context("break-at-end"),
        )
      ).outcome,
    ).toBe("created");
    expect(
      await work.undo(scope, "wrk_log", { ...context("undo-log"), now }),
    ).toEqual({ outcome: "stale" });
    expect(
      await work.undo(scope, "wrk_rule", { ...context("undo-rule"), now }),
    ).toEqual({ outcome: "stale" });
    const reverted = await work.undo(scope, "wrk_shift", {
      ...context("undo-shift"),
      now,
    });
    expect(reverted).toMatchObject({
      outcome: "reverted",
      entityKind: "shift",
    });
    const originalRetry = await work.createShift(
      scope,
      "must-not-be-created",
      {
        title: "Retry",
        startAtUtc: new Date("2026-08-10T08:00:00Z"),
        endAtUtc: new Date("2026-08-10T09:00:00Z"),
        originalTimeZone: "UTC",
      },
      context("shift"),
    );
    expect(originalRetry).toMatchObject({
      outcome: "duplicate",
      entity: { id: "shift-1" },
    });
    expect(await work.getShift(scope, "must-not-be-created")).toBeNull();
    expect(
      await work.undo(scope, "wrk_shift", { ...context("undo-replay"), now }),
    ).toEqual({ outcome: "used" });
    await work.createShift(
      scope,
      "shift-expired",
      {
        title: "Scaduto",
        startAtUtc: new Date("2026-08-09T08:00:00Z"),
        endAtUtc: new Date("2026-08-09T09:00:00Z"),
        originalTimeZone: "UTC",
      },
      context("expired"),
    );
    expect(
      await work.undo(scope, "wrk_expired", {
        ...context("undo-expired"),
        now: new Date(now.getTime() + 900_001),
      }),
    ).toEqual({ outcome: "expired" });
    await work.createShift(
      scope,
      "shift-version-stale",
      {
        title: "Versione cambiata",
        startAtUtc: new Date("2026-08-11T08:00:00Z"),
        endAtUtc: new Date("2026-08-11T09:00:00Z"),
        originalTimeZone: "UTC",
      },
      context("version-stale"),
    );
    await env.DB.prepare(
      "UPDATE planned_shifts SET version = version + 1 WHERE user_id = ? AND id = ?",
    )
      .bind(scope.userId, "shift-version-stale")
      .run();
    expect(
      await work.undo(scope, "wrk_version-stale", {
        ...context("undo-version-stale"),
        now,
      }),
    ).toEqual({ outcome: "stale" });
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_log").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(11);
  });

  it("accepts exactly 500 report records and rejects 501 without partial totals", async () => {
    await env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         VALUES (1)
         UNION ALL
         SELECT value + 1 FROM sequence WHERE value < 500
       )
       INSERT INTO planned_shifts (
         id, user_id, title, start_at_utc, end_at_utc, original_time_zone,
         version, last_mutation_key, created_at, updated_at
       )
       SELECT 'limit-' || value, ?, 'Limite', ?, ?, 'UTC', 1,
              'fixture-' || value, ?, ?
       FROM sequence`,
    )
      .bind(
        scope.userId,
        Date.parse("2026-08-12T08:00:00Z"),
        Date.parse("2026-08-12T09:00:00Z"),
        now.getTime(),
        now.getTime(),
      )
      .run();
    const window = workReportWindow({
      startDate: "2026-08-12",
      endDate: "2026-08-12",
      timeZone: "UTC",
    });
    if (!window.ok) throw new Error("window");
    const exactLimit = await work.report(scope, window.value);
    expect(exactLimit?.plannedShifts).toHaveLength(500);
    expect(exactLimit?.totals.scheduledMinutes).toBe(30_000);

    await env.DB.prepare(
      `INSERT INTO planned_shifts (
         id, user_id, title, start_at_utc, end_at_utc, original_time_zone,
         version, last_mutation_key, created_at, updated_at
       ) VALUES ('limit-501', ?, 'Oltre limite', ?, ?, 'UTC', 1, 'fixture-501', ?, ?)`,
    )
      .bind(
        scope.userId,
        Date.parse("2026-08-12T08:00:00Z"),
        Date.parse("2026-08-12T09:00:00Z"),
        now.getTime(),
        now.getTime(),
      )
      .run();
    await expect(work.report(scope, window.value)).resolves.toBeNull();
  });

  it("does not mark /oggi partial when only hidden work categories exceed their limit", async () => {
    await work.createRule(
      scope,
      "sentinel-rule",
      { name: "Sentinel", breakTreatment: "paid" },
      context("sentinel-rule"),
    );
    await work.createShift(
      scope,
      "sentinel-shift",
      {
        title: "Unico turno visibile",
        startAtUtc: new Date("2026-08-13T08:00:00Z"),
        endAtUtc: new Date("2026-08-13T09:00:00Z"),
        originalTimeZone: "UTC",
      },
      context("sentinel-shift"),
    );
    await env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (
         VALUES (1)
         UNION ALL
         SELECT value + 1 FROM sequence WHERE value < 51
       )
       INSERT INTO work_logs (
         id, user_id, title, start_at_utc, end_at_utc, original_time_zone,
         rule_id, rule_version, rule_name, break_treatment, version,
         last_mutation_key, created_at, updated_at
       )
       SELECT 'sentinel-log-' || value, ?, 'Consuntivo', ?, ?, 'UTC',
              'sentinel-rule', 1, 'Sentinel', 'paid', 1,
              'sentinel-fixture-' || value, ?, ?
       FROM sequence`,
    )
      .bind(
        scope.userId,
        Date.parse("2026-08-13T08:00:00Z"),
        Date.parse("2026-08-13T09:00:00Z"),
        now.getTime(),
        now.getTime(),
      )
      .run();
    const day = await work.listForDay(scope, {
      startAtUtc: new Date("2026-08-13T00:00:00Z"),
      endAtUtc: new Date("2026-08-14T00:00:00Z"),
      timeZone: "UTC",
    });
    expect(day.truncated).toBe(true);
    expect(day.plannedShiftsTruncated).toBe(false);

    await env.DB.prepare(
      `INSERT INTO user_preferences (
        user_id, language, time_zone, hour_format, default_currency,
        quiet_hours_start_minute, quiet_hours_end_minute, version,
        last_mutation_key, created_at, updated_at
      ) VALUES (?, 'it', 'UTC', '24h', 'EUR', NULL, NULL, 1, 'fixture', ?, ?)`,
    )
      .bind(scope.userId, now.getTime(), now.getTime())
      .run();
    const today = await manageEvents(
      {
        actorUserId: scope.userId,
        scope,
        correlationId: "sentinel-today",
        idempotencyKey: "sentinel-today",
        sentAtUnix: Date.parse("2026-08-13T10:00:00Z") / 1_000,
        command: { kind: "events.today" },
      },
      {
        authorizer: new SelfScopeAuthorizer(),
        clock: new FakeClock(now),
        events: new D1EventRepository(env.DB),
        ids: new SequenceIds(),
        preferences: new D1PreferenceRepository(env.DB),
        dayViewContributors: [
          workDayViewContributor({
            authorizer: new SelfScopeAuthorizer(),
            work,
          }),
        ],
      },
    );
    expect(today).toContain("Unico turno visibile");
    expect(today).not.toContain("Dettaglio parziale");
  });

  it("runs the application command flow and includes planned shifts in /oggi", async () => {
    await env.DB.prepare(
      `INSERT INTO user_preferences (
        user_id, language, time_zone, hour_format, default_currency,
        quiet_hours_start_minute, quiet_hours_end_minute, version,
        last_mutation_key, created_at, updated_at
      ) VALUES (?, 'it', 'UTC', '24h', 'EUR', NULL, NULL, 1, 'fixture', ?, ?)`,
    )
      .bind(scope.userId, now.getTime(), now.getTime())
      .run();
    const dependencies = {
      authorizer: new SelfScopeAuthorizer(),
      clock: new FakeClock(now),
      ids: new SequenceIds(),
      preferences: new D1PreferenceRepository(env.DB),
      work,
    };
    const request = (idempotencyKey: string) => ({
      actorUserId: scope.userId,
      scope,
      correlationId: `corr-${idempotencyKey}`,
      idempotencyKey,
    });
    expect(
      await manageWork(
        {
          ...request("app-rule"),
          command: {
            kind: "work.rule.create",
            breakTreatment: "unpaid",
            name: "Standard",
          },
        },
        dependencies,
      ),
    ).toContain("Elemento lavoro creato.");
    const rule = (await work.listRules(scope, 10))[0];
    if (rule === undefined) throw new Error("rule fixture missing");
    expect(
      await manageWork(
        {
          ...request("app-shift"),
          command: {
            kind: "work.shift.create",
            startLocal: "2026-08-08T08:00",
            endLocal: "2026-08-08T16:00",
            title: "Turno applicativo",
          },
        },
        dependencies,
      ),
    ).toContain("Turno applicativo");
    expect(
      await manageWork(
        {
          ...request("app-log"),
          command: {
            kind: "work.log.create",
            startLocal: "2026-08-08T08:00",
            endLocal: "2026-08-08T16:00",
            ruleId: rule.id,
            title: "Consuntivo applicativo",
          },
        },
        dependencies,
      ),
    ).toContain("Regola snapshot: Standard");
    const report = await manageWork(
      {
        ...request("app-report"),
        command: {
          kind: "work.report",
          startDate: "2026-08-08",
          endDate: "2026-08-08",
        },
      },
      dependencies,
    );
    expect(report).toContain("Formula: work-report-v1");
    expect(report).toContain("Timezone: UTC");
    expect(report).toContain("Contributori: 1 turni, 1 consuntivi, 0 pause.");

    const today = await manageEvents(
      {
        ...request("app-today"),
        sentAtUnix: Math.floor(now.getTime() / 1_000),
        command: { kind: "events.today" },
      },
      {
        ...dependencies,
        events: new D1EventRepository(env.DB),
        dayViewContributors: [
          workDayViewContributor({
            authorizer: dependencies.authorizer,
            work,
          }),
        ],
      },
    );
    expect(today).toContain("Turni pianificati:");
    expect(today).toContain("Turno applicativo");
    expect(today).not.toContain("Consuntivo applicativo");

    for (let index = 0; index < 40; index += 1) {
      await work.createShift(
        scope,
        `overflow-${String(index)}-${"i".repeat(70)}`,
        {
          title: `Elemento ${String(index)} ${"x".repeat(180)}`,
          startAtUtc: new Date("2026-08-10T08:00:00Z"),
          endAtUtc: new Date("2026-08-10T09:00:00Z"),
          originalTimeZone: "UTC",
        },
        context(`overflow-${String(index)}`),
      );
    }
    const boundedDay = await manageWork(
      {
        ...request("app-day-bounded"),
        command: { kind: "work.day", localDate: "2026-08-10" },
      },
      dependencies,
    );
    expect(boundedDay.length).toBeLessThanOrEqual(3_500);
    expect(boundedDay).toContain("dettagli non mostrati");
    const boundedReport = await manageWork(
      {
        ...request("app-report-bounded"),
        command: {
          kind: "work.report",
          startDate: "2026-08-10",
          endDate: "2026-08-10",
        },
      },
      dependencies,
    );
    expect(boundedReport).toContain("Pianificato:");
    expect(boundedReport).toContain("dettagli non mostrati");
    expect(boundedReport.length).toBeLessThanOrEqual(3_500);

    const boundedToday = await manageEvents(
      {
        ...request("app-today-bounded"),
        sentAtUnix: Date.parse("2026-08-10T10:00:00Z") / 1_000,
        command: { kind: "events.today" },
      },
      {
        ...dependencies,
        events: new D1EventRepository(env.DB),
        dayViewContributors: [
          workDayViewContributor({
            authorizer: dependencies.authorizer,
            work,
          }),
        ],
      },
    );
    expect(boundedToday.length).toBeLessThanOrEqual(3_500);
    expect(boundedToday).toContain("dettagli non mostrati");

    for (let index = 0; index < 26; index += 1) {
      await work.createRule(
        scope,
        `rule-overflow-${String(index)}`,
        {
          name: `Regola ${String(index)} ${"r".repeat(85)}`,
          breakTreatment: "paid",
        },
        context(`rule-overflow-${String(index)}`),
      );
    }
    const boundedRules = await manageWork(
      {
        ...request("app-rules-bounded"),
        command: { kind: "work.rule.list" },
      },
      dependencies,
    );
    expect(boundedRules.length).toBeLessThanOrEqual(3_500);
    expect(boundedRules).toContain("dettagli non mostrati");
  });

  it("routes /lavoro through the inbound consumer without AI", async () => {
    const clock = new FakeClock(now);
    const reply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const dependencies = testInboundDependencies({
      authorizer: new SelfScopeAuthorizer(),
      clock,
      deliveries: new D1DeliveryRepository(env.DB),
      effects: new D1EffectRepository(env.DB),
      events: new D1EventRepository(env.DB),
      identities: new D1IdentityRepository(env.DB),
      ids: new SequenceIds(),
      inbox,
      preferences: new D1PreferenceRepository(env.DB),
      reminders: new D1ReminderRepository(env.DB),
      tasks: new D1TaskRepository(env.DB),
      work: new D1WorkRepository(env.DB),
      reply,
      leaseSeconds: 60,
    });
    const preference = envelope(
      8_401,
      "/impostazioni imposta it Europe/Rome 24h EUR",
    );
    const rule = envelope(
      8_402,
      "/lavoro regola crea non_retribuita | Standard",
    );
    for (const message of [preference, rule]) {
      await inbox.register(message, clock.now());
      await processInboundMessage(message, dependencies);
    }
    const ruleId = reply.texts[1]?.match(/ID: ([A-Za-z0-9-]+)/u)?.[1];
    if (ruleId === undefined) throw new Error("rule ID missing");
    const shiftMessage = envelope(
      8_403,
      "/lavoro turno crea 2026-08-08T08:00 2026-08-08T16:00 | Turno Queue",
    );
    for (const message of [
      shiftMessage,
      envelope(
        8_404,
        `/lavoro consuntivo crea 2026-08-08T08:00 2026-08-08T16:00 ${ruleId} | Consuntivo Queue`,
      ),
      envelope(8_405, "/lavoro report 2026-08-08 2026-08-08"),
      envelope(8_406, "/oggi"),
    ]) {
      await inbox.register(message, clock.now());
      await processInboundMessage(message, dependencies);
    }
    expect(reply.texts[2]).toContain("Turno Queue");
    expect(reply.texts[3]).toContain("Consuntivo Queue");
    expect(reply.texts[4]).toContain("Formula: work-report-v1");
    expect(reply.texts[5]).toContain("Turni pianificati:");
    expect(reply.texts[5]).toContain("Turno Queue");
    const replyCountBeforeRetry = reply.texts.length;
    await expect(
      processInboundMessage(shiftMessage, dependencies),
    ).resolves.toEqual({ outcome: "duplicate" });
    expect(reply.texts).toHaveLength(replyCountBeforeRetry);
    const shiftCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM planned_shifts",
    ).first<{ count: number }>();
    expect(shiftCount?.count).toBe(1);
  });

  it("retries the Queue reply after a committed work create without duplicating state", async () => {
    const clock = new FakeClock(now);
    const ids = new SequenceIds();
    const setupReply = new CapturingReply();
    const inbox = new D1InboundRepository(env.DB);
    const dependencies = testInboundDependencies({
      authorizer: new SelfScopeAuthorizer(),
      clock,
      deliveries: new D1DeliveryRepository(env.DB),
      effects: new D1EffectRepository(env.DB),
      events: new D1EventRepository(env.DB),
      identities: new D1IdentityRepository(env.DB),
      ids,
      inbox,
      preferences: new D1PreferenceRepository(env.DB),
      reminders: new D1ReminderRepository(env.DB),
      tasks: new D1TaskRepository(env.DB),
      work: new D1WorkRepository(env.DB),
      reply: setupReply,
      leaseSeconds: 60,
    });
    for (const message of [
      envelope(8_501, "/impostazioni imposta it Europe/Rome 24h EUR"),
      envelope(8_502, "/lavoro regola crea non_retribuita | Standard"),
    ]) {
      await inbox.register(message, clock.now());
      await processInboundMessage(message, dependencies);
    }

    const shift = envelope(
      8_503,
      "/lavoro turno crea 2026-08-08T08:00 2026-08-08T16:00 | Turno retry",
    );
    await inbox.register(shift, clock.now());
    const reply = new RetryOnceReply();
    await handleInboundQueue(
      createMessageBatch("tessavio-inbound-dev", [
        {
          id: "work-first-attempt",
          timestamp: clock.now(),
          attempts: 1,
          body: shift,
        },
      ]),
      env,
      { clock, ids, reply },
    );
    clock.advance(60_000);
    await handleInboundQueue(
      createMessageBatch("tessavio-inbound-dev", [
        {
          id: "work-reply-retry",
          timestamp: clock.now(),
          attempts: 2,
          body: shift,
        },
      ]),
      env,
      { clock, ids, reply },
    );

    expect(reply.calls).toBe(2);
    expect(reply.successfulCalls).toBe(1);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM planned_shifts WHERE title = ?",
        )
          .bind("Turno retry")
          .first<{ count: number }>()
      )?.count,
    ).toBe(1);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'work.shift.created'",
        ).first<{ count: number }>()
      )?.count,
    ).toBe(1);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM work_undo_actions WHERE entity_kind = 'shift'",
        ).first<{ count: number }>()
      )?.count,
    ).toBe(1);
  });
});
