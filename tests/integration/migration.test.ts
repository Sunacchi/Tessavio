import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("foundation migration", () => {
  it("upgrades a populated B6.1 database to B6.2 without changing reminders", async () => {
    const b62MigrationIndex = env.TEST_MIGRATIONS.findIndex((migration) =>
      migration.name.startsWith("0008_"),
    );
    expect(b62MigrationIndex).toBeGreaterThan(0);
    await applyD1Migrations(
      env.UPGRADE_DB,
      env.TEST_MIGRATIONS.slice(0, b62MigrationIndex),
    );
    const timestamp = Date.parse("2026-08-19T10:00:00Z");
    await env.UPGRADE_DB.batch([
      env.UPGRADE_DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('b62-upgrade', 'active', ?)",
      ).bind(timestamp),
      env.UPGRADE_DB.prepare(
        `INSERT INTO reminders (
          id,user_id,text,requested_at_utc,due_at_utc,original_time_zone,status,
          version,last_mutation_key,created_at,updated_at
        ) VALUES ('reminder-b2','b62-upgrade','Fixture B2',?,?,
          'Europe/Rome','pending',1,'fixture',?,?)`,
      ).bind(timestamp, timestamp, timestamp, timestamp),
    ]);
    await applyD1Migrations(
      env.UPGRADE_DB,
      env.TEST_MIGRATIONS.slice(b62MigrationIndex),
    );
    await expect(
      env.UPGRADE_DB.prepare(
        "SELECT text, version FROM reminders WHERE user_id = ? AND id = ?",
      )
        .bind("b62-upgrade", "reminder-b2")
        .first(),
    ).resolves.toEqual({ text: "Fixture B2", version: 1 });
    const recurrenceTables = await env.UPGRADE_DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (
        'reminder_recurrences', 'reminder_recurrence_occurrences',
        'reminder_recurrence_undo_actions'
      ) ORDER BY name`,
    ).all<{ name: string }>();
    expect(recurrenceTables.results.map((row) => row.name)).toEqual([
      "reminder_recurrence_occurrences",
      "reminder_recurrence_undo_actions",
      "reminder_recurrences",
    ]);
  });

  it("upgrades a populated B5 database through B6.2 without changing finance records", async () => {
    const b6MigrationIndex = env.TEST_MIGRATIONS.findIndex((migration) =>
      migration.name.startsWith("0007_"),
    );
    expect(b6MigrationIndex).toBeGreaterThan(0);
    await applyD1Migrations(
      env.UPGRADE_DB,
      env.TEST_MIGRATIONS.slice(0, b6MigrationIndex),
    );
    const timestamp = Date.parse("2026-08-19T10:00:00Z");
    await env.UPGRADE_DB.batch([
      env.UPGRADE_DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('b6-upgrade', 'active', ?)",
      ).bind(timestamp),
      env.UPGRADE_DB.prepare(
        `INSERT INTO finance_entries (
          id,user_id,entry_kind,amount_minor,currency,local_date,category,
          merchant,payment_method,note,source,status,version,last_mutation_key,
          created_at,updated_at,deleted_at
        ) VALUES ('finance-b5','b6-upgrade','expense',100,'EUR','2026-08-19',
          'Fixture',NULL,NULL,NULL,'manual_command','active',1,'fixture',?,?,NULL)`,
      ).bind(timestamp, timestamp),
    ]);
    await applyD1Migrations(
      env.UPGRADE_DB,
      env.TEST_MIGRATIONS.slice(b6MigrationIndex),
    );
    await expect(
      env.UPGRADE_DB.prepare(
        "SELECT amount_minor, version FROM finance_entries WHERE user_id = ? AND id = ?",
      )
        .bind("b6-upgrade", "finance-b5")
        .first(),
    ).resolves.toEqual({ amount_minor: 100, version: 1 });
    const b6Tables = await env.UPGRADE_DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('lists','list_items','notes','list_undo_actions')
       ORDER BY name`,
    ).all<{ name: string }>();
    expect(b6Tables.results.map((row) => row.name)).toEqual([
      "list_items",
      "list_undo_actions",
      "lists",
      "notes",
    ]);
  });

  it("upgrades a populated B4 database to B5 without changing work records", async () => {
    const b5MigrationIndex = env.TEST_MIGRATIONS.findIndex((migration) =>
      migration.name.startsWith("0006_"),
    );
    expect(b5MigrationIndex).toBeGreaterThan(0);
    await applyD1Migrations(
      env.UPGRADE_DB,
      env.TEST_MIGRATIONS.slice(0, b5MigrationIndex),
    );
    const timestamp = Date.parse("2026-08-08T10:00:00Z");
    await env.UPGRADE_DB.batch([
      env.UPGRADE_DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('b5-upgrade', 'active', ?)",
      ).bind(timestamp),
      env.UPGRADE_DB.prepare(
        `INSERT INTO work_rules (
          id,user_id,name,break_treatment,version,last_mutation_key,created_at,updated_at
        ) VALUES ('rule-b4','b5-upgrade','Fixture B4','paid',1,'fixture',?,?)`,
      ).bind(timestamp, timestamp),
    ]);
    await applyD1Migrations(
      env.UPGRADE_DB,
      env.TEST_MIGRATIONS.slice(b5MigrationIndex),
    );
    await expect(
      env.UPGRADE_DB.prepare(
        "SELECT name, version FROM work_rules WHERE user_id = ? AND id = ?",
      )
        .bind("b5-upgrade", "rule-b4")
        .first(),
    ).resolves.toEqual({ name: "Fixture B4", version: 1 });
    const financeTables = await env.UPGRADE_DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('finance_entries','finance_undo_actions')
       ORDER BY name`,
    ).all<{ name: string }>();
    expect(financeTables.results.map((row) => row.name)).toEqual([
      "finance_entries",
      "finance_undo_actions",
    ]);
  });

  it("upgrades a populated B3 database to B4 without changing B3 records", async () => {
    const b4MigrationIndex = env.TEST_MIGRATIONS.findIndex((migration) =>
      migration.name.startsWith("0005_"),
    );
    expect(b4MigrationIndex).toBeGreaterThan(0);
    await applyD1Migrations(
      env.UPGRADE_DB,
      env.TEST_MIGRATIONS.slice(0, b4MigrationIndex),
    );
    const timestamp = Date.parse("2026-08-08T10:00:00Z");
    await env.UPGRADE_DB.batch([
      env.UPGRADE_DB.prepare(
        "INSERT INTO users (id, status, created_at) VALUES ('upgrade-user', 'active', ?)",
      ).bind(timestamp),
      env.UPGRADE_DB.prepare(
        `INSERT INTO tasks (
          id, user_id, title, priority, due_kind, due_date_local, due_at_utc,
          time_zone, status, version, last_mutation_key, created_at, updated_at,
          completed_at
        ) VALUES ('upgrade-task', 'upgrade-user', 'Fixture B3', 'medium',
          'none', NULL, NULL, NULL, 'open', 1, 'fixture', ?, ?, NULL)`,
      ).bind(timestamp, timestamp),
    ]);
    await applyD1Migrations(
      env.UPGRADE_DB,
      env.TEST_MIGRATIONS.slice(b4MigrationIndex),
    );
    await expect(
      env.UPGRADE_DB.prepare(
        "SELECT title, version FROM tasks WHERE user_id = ? AND id = ?",
      )
        .bind("upgrade-user", "upgrade-task")
        .first(),
    ).resolves.toEqual({ title: "Fixture B3", version: 1 });
    const workTables = await env.UPGRADE_DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'work_rules', 'planned_shifts', 'work_logs', 'work_breaks',
         'work_undo_actions'
       ) ORDER BY name`,
    ).all<{ name: string }>();
    expect(workTables.results.map((row) => row.name)).toEqual([
      "planned_shifts",
      "work_breaks",
      "work_logs",
      "work_rules",
      "work_undo_actions",
    ]);
  });

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
        "reminders",
        "reminder_undo_actions",
        "notification_deliveries",
        "tasks",
        "task_undo_actions",
        "work_rules",
        "planned_shifts",
        "work_logs",
        "work_breaks",
        "work_undo_actions",
        "finance_entries",
        "finance_undo_actions",
        "lists",
        "list_items",
        "notes",
        "list_undo_actions",
        "reminder_recurrences",
        "reminder_recurrence_occurrences",
        "reminder_recurrence_undo_actions",
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

    const reminderDuePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id, user_id FROM reminders
       WHERE status = 'pending' AND due_at_utc <= ?
       ORDER BY due_at_utc, id LIMIT 100`,
    )
      .bind(Date.now())
      .all<{ detail: string }>();
    expect(
      reminderDuePlan.results.some((row) =>
        row.detail.includes("reminders_due_claim_idx"),
      ),
    ).toBe(true);

    const reminderScopePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM reminders
       WHERE user_id = ? AND status IN ('pending', 'claimed', 'sending')
       ORDER BY due_at_utc LIMIT 50`,
    )
      .bind("user-a")
      .all<{ detail: string }>();
    expect(
      reminderScopePlan.results.some((row) =>
        row.detail.includes("reminders_scope_list_idx"),
      ),
    ).toBe(true);

    const reminderDayPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM reminders
       WHERE user_id = ? AND status IN ('pending', 'claimed', 'sending')
         AND due_at_utc >= ? AND due_at_utc < ?
       ORDER BY due_at_utc, id LIMIT 51`,
    )
      .bind("user-a", Date.now(), Date.now() + 86_400_000)
      .all<{ detail: string }>();
    expect(
      reminderDayPlan.results.some((row) =>
        row.detail.includes("reminders_scope_list_idx"),
      ),
    ).toBe(true);

    const notificationPurgePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT dedupe_key FROM notification_deliveries
       WHERE scope_user_id = ? AND created_at <= ?
         AND status IN ('sent', 'ambiguous', 'permanent_failure')
       ORDER BY created_at, dedupe_key LIMIT 100`,
    )
      .bind("user-a", Date.now())
      .all<{ detail: string }>();
    expect(
      notificationPurgePlan.results.some((row) =>
        row.detail.includes("notification_deliveries_scope_idx"),
      ),
    ).toBe(true);

    const reminderRecoveryPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM reminders
       WHERE status = 'claimed'
         AND ((enqueued_at IS NULL AND claimed_at <= ?) OR claim_expires_at <= ?)
       ORDER BY claimed_at LIMIT 100`,
    )
      .bind(Date.now(), Date.now())
      .all<{ detail: string }>();
    expect(
      reminderRecoveryPlan.results.some((row) =>
        row.detail.includes("reminders_recovery_idx"),
      ),
    ).toBe(true);

    const recurrenceDuePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id, user_id FROM reminder_recurrences
       WHERE status = 'active' AND next_due_at_utc <= ?
       ORDER BY next_due_at_utc, id LIMIT 100`,
    )
      .bind(Date.now())
      .all<{ detail: string }>();
    expect(
      recurrenceDuePlan.results.some((row) =>
        row.detail.includes("reminder_recurrences_due_idx"),
      ),
    ).toBe(true);

    const recurrenceScopePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM reminder_recurrences
       WHERE user_id = ? AND status = 'active'
       ORDER BY next_due_at_utc, id LIMIT 50`,
    )
      .bind("user-a")
      .all<{ detail: string }>();
    expect(
      recurrenceScopePlan.results.some((row) =>
        row.detail.includes("reminder_recurrences_scope_list_idx"),
      ),
    ).toBe(true);

    const recurrenceUndoPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT token FROM reminder_recurrence_undo_actions
       WHERE scope_user_id = ? AND expires_at <= ?
       ORDER BY expires_at LIMIT 100`,
    )
      .bind("user-a", Date.now())
      .all<{ detail: string }>();
    expect(
      recurrenceUndoPlan.results.some((row) =>
        row.detail.includes("reminder_recurrence_undo_scope_expiry_idx"),
      ),
    ).toBe(true);

    const taskListPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM tasks
       WHERE user_id = ? AND status = 'open'
       ORDER BY priority, created_at LIMIT 50`,
    )
      .bind("user-a")
      .all<{ detail: string }>();
    expect(
      taskListPlan.results.some((row) =>
        row.detail.includes("tasks_scope_status_idx"),
      ),
    ).toBe(true);

    const taskDatePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM tasks
       WHERE user_id = ? AND status = 'open' AND due_date_local = ?`,
    )
      .bind("user-a", "2026-08-08")
      .all<{ detail: string }>();
    expect(
      taskDatePlan.results.some((row) =>
        row.detail.includes("tasks_scope_date_idx"),
      ),
    ).toBe(true);

    const taskInstantPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM tasks
       WHERE user_id = ? AND status = 'open'
         AND due_at_utc >= ? AND due_at_utc < ?`,
    )
      .bind("user-a", Date.now(), Date.now() + 86_400_000)
      .all<{ detail: string }>();
    expect(
      taskInstantPlan.results.some((row) =>
        row.detail.includes("tasks_scope_instant_idx"),
      ),
    ).toBe(true);

    const taskUndoPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT token FROM task_undo_actions
       WHERE scope_user_id = ? AND expires_at <= ?
       ORDER BY expires_at LIMIT 100`,
    )
      .bind("user-a", Date.now())
      .all<{ detail: string }>();
    expect(
      taskUndoPlan.results.some((row) =>
        row.detail.includes("task_undo_scope_expiry_idx"),
      ),
    ).toBe(true);

    const workDayPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM work_logs
       WHERE user_id = ? AND start_at_utc < ? AND end_at_utc > ?
       ORDER BY start_at_utc, id LIMIT 50`,
    )
      .bind("user-a", Date.now() + 86_400_000, Date.now())
      .all<{ detail: string }>();
    expect(
      workDayPlan.results.some((row) =>
        row.detail.includes("work_logs_scope_time_idx"),
      ),
    ).toBe(true);

    const plannedShiftPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM planned_shifts
       WHERE user_id = ? AND start_at_utc < ? AND end_at_utc > ?
       ORDER BY start_at_utc, id LIMIT 50`,
    )
      .bind("user-a", Date.now() + 86_400_000, Date.now())
      .all<{ detail: string }>();
    expect(
      plannedShiftPlan.results.some((row) =>
        row.detail.includes("planned_shifts_scope_time_idx"),
      ),
    ).toBe(true);

    const workRulesPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM work_rules
       WHERE user_id = ? ORDER BY created_at, id LIMIT 50`,
    )
      .bind("user-a")
      .all<{ detail: string }>();
    expect(
      workRulesPlan.results.some((row) =>
        row.detail.includes("work_rules_scope_list_idx"),
      ),
    ).toBe(true);

    const workBreakPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM work_breaks
       WHERE user_id = ? AND work_log_id = ?
         AND start_at_utc < ? AND end_at_utc > ? LIMIT 1`,
    )
      .bind("user-a", "log-a", Date.now() + 3_600_000, Date.now())
      .all<{ detail: string }>();
    expect(
      workBreakPlan.results.some((row) =>
        row.detail.includes("work_breaks_scope_log_time_idx"),
      ),
    ).toBe(true);

    const workUndoPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT token FROM work_undo_actions
       WHERE scope_user_id = ? AND expires_at <= ?
       ORDER BY expires_at LIMIT 100`,
    )
      .bind("user-a", Date.now())
      .all<{ detail: string }>();
    expect(
      workUndoPlan.results.some((row) =>
        row.detail.includes("work_undo_scope_expiry_idx"),
      ),
    ).toBe(true);

    const financeRangePlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM finance_entries
       WHERE user_id = ? AND status = 'active'
         AND local_date >= ? AND local_date <= ?
       ORDER BY local_date DESC, created_at DESC, id LIMIT 50`,
    )
      .bind("user-a", "2026-08-01", "2026-08-31")
      .all<{ detail: string }>();
    expect(
      financeRangePlan.results.some((row) =>
        row.detail.includes("finance_entries_scope_date_idx"),
      ),
    ).toBe(true);

    const financeUndoPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT token FROM finance_undo_actions
       WHERE scope_user_id = ? AND expires_at <= ?
       ORDER BY expires_at LIMIT 100`,
    )
      .bind("user-a", Date.now())
      .all<{ detail: string }>();
    expect(
      financeUndoPlan.results.some((row) =>
        row.detail.includes("finance_undo_scope_expiry_idx"),
      ),
    ).toBe(true);

    const listsPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM lists
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at, id LIMIT 50`,
    )
      .bind("user-a")
      .all<{ detail: string }>();
    expect(
      listsPlan.results.some((row) =>
        row.detail.includes("lists_scope_status_created_idx"),
      ),
    ).toBe(true);

    const itemsPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM list_items
       WHERE user_id = ? AND list_id = ? AND status != 'deleted'
       ORDER BY created_at, id LIMIT 100`,
    )
      .bind("user-a", "list-a")
      .all<{ detail: string }>();
    expect(
      itemsPlan.results.some((row) =>
        row.detail.includes("list_items_scope_list_status_idx"),
      ),
    ).toBe(true);

    const notesPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM notes
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at, id LIMIT 50`,
    )
      .bind("user-a")
      .all<{ detail: string }>();
    expect(
      notesPlan.results.some((row) =>
        row.detail.includes("notes_scope_status_created_idx"),
      ),
    ).toBe(true);

    const listUndoPlan = await env.DB.prepare(
      `EXPLAIN QUERY PLAN SELECT token FROM list_undo_actions
       WHERE scope_user_id = ? AND expires_at <= ?
       ORDER BY expires_at LIMIT 100`,
    )
      .bind("user-a", Date.now())
      .all<{ detail: string }>();
    expect(
      listUndoPlan.results.some((row) =>
        row.detail.includes("list_undo_scope_expiry_idx"),
      ),
    ).toBe(true);
  });
});
