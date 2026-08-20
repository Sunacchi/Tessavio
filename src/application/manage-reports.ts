import {
  isReportCommand,
  reportCommandKinds,
  type ReportCommand,
} from "./commands/reports";
import {
  commandRegistration,
  type CommandDocumentReply,
  type CommandRegistration,
  type CommandReply,
} from "./handler-registry";
import type {
  EventRepository,
  FinanceRepository,
  PreferenceRepository,
  TaskRepository,
  WorkRepository,
} from "./ports";
import type { EventRecord } from "../domains/events/events";
import {
  calculateFinanceTotals,
  type FinanceEntryRecord,
} from "../domains/finance/finance";
import {
  baseReportContributorLimit,
  baseReportMaxCsvBytes,
  baseReportPolicyVersion,
  baseReportWindow,
  renderCsv,
  type BaseReportValidationIssue,
  type BaseReportWindow,
} from "../domains/reports/reports";
import type { TaskRecord } from "../domains/tasks/tasks";
import type { WorkReport } from "../domains/work/work";
import type { Authorizer } from "../security/authorization";
import type { UserScope } from "../shared/contracts";

export interface ManageReportsDependencies {
  readonly authorizer: Authorizer;
  readonly events: EventRepository;
  readonly finance: FinanceRepository;
  readonly preferences: PreferenceRepository;
  readonly tasks: TaskRepository;
  readonly work: WorkRepository;
}

export interface ManageReportsRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly command: ReportCommand;
}

export type CsvReportReply = CommandDocumentReply;

export type ManageReportsResult = CommandReply;

interface ReportContributors {
  readonly events: readonly EventRecord[];
  readonly tasks: readonly TaskRecord[];
  readonly work: WorkReport;
  readonly finance: readonly FinanceEntryRecord[];
}

const usage = [
  "Comandi report:",
  "/report <YYYY-MM-DD> <YYYY-MM-DD>",
  "/report csv <YYYY-MM-DD> <YYYY-MM-DD>",
].join("\n");

function validationMessage(issue: BaseReportValidationIssue): string {
  switch (issue) {
    case "date":
      return "Data non valida: usa YYYY-MM-DD.";
    case "range_order":
      return "La data finale deve essere uguale o successiva a quella iniziale.";
    case "range_duration":
      return "Il report può coprire al massimo 366 giorni civili inclusivi.";
    case "time_zone":
      return "Timezone del profilo non valida: aggiorna /impostazioni.";
  }
}

function provenance(ids: readonly string[]): string {
  const visible = ids.slice(0, 8).join(", ");
  const suffix = ids.length > 8 ? `, +${String(ids.length - 8)}` : "";
  return ids.length === 0 ? "nessuno" : `${visible}${suffix}`;
}

function renderSummary(
  window: BaseReportWindow,
  contributors: ReportContributors,
): string {
  const financeTotals = calculateFinanceTotals(contributors.finance);
  const financeLines =
    financeTotals.length === 0
      ? ["Finanze: nessun movimento attivo."]
      : financeTotals.map(
          (total) =>
            `Finanze ${total.currency}: entrate ${total.incomeMinor.toString()}, spese ${total.expenseMinor.toString()}, netto ${total.netMinor.toString()} unità minori (${String(total.entryCount)} movimenti).`,
        );
  const workIds = [
    ...contributors.work.plannedShifts.map((entry) => entry.id),
    ...contributors.work.workLogs.map((entry) => entry.id),
    ...contributors.work.breaks.map((entry) => entry.id),
  ];
  const openTasks = contributors.tasks.filter(
    (entry) => entry.status === "open",
  ).length;
  const completedTasks = contributors.tasks.length - openTasks;
  return [
    `Report base ${window.startDate} → ${window.endDate}`,
    `Timezone: ${window.timeZone}`,
    `Formula: ${baseReportPolicyVersion}; lavoro=${contributors.work.policyVersion}; finanze=entrate-spese per valuta, senza conversione.`,
    `Agenda: ${String(contributors.events.length)} eventi attivi nel periodo.`,
    `Task con scadenza nel periodo: ${String(contributors.tasks.length)} (${String(openTasks)} aperte, ${String(completedTasks)} completate).`,
    `Lavoro: pianificato ${String(contributors.work.totals.scheduledMinutes)} min; lordo ${String(contributors.work.totals.actualGrossMinutes)} min; pause ${String(contributors.work.totals.breakMinutes)} min; conteggiato ${String(contributors.work.totals.countedMinutes)} min.`,
    ...financeLines,
    "Provenienza dei totali (ID contributori; dettaglio completo nel CSV):",
    `Agenda: ${provenance(contributors.events.map((entry) => entry.id))}`,
    `Task: ${provenance(contributors.tasks.map((entry) => entry.id))}`,
    `Lavoro: ${provenance(workIds)}`,
    `Finanze: ${provenance(contributors.finance.map((entry) => entry.id))}`,
  ].join("\n");
}

function iso(value: Date | null | undefined): string {
  return value?.toISOString() ?? "";
}

function csvRows(
  window: BaseReportWindow,
  contributors: ReportContributors,
): readonly (readonly string[])[] {
  const prefix = [
    baseReportPolicyVersion,
    window.timeZone,
    window.startDate,
    window.endDate,
  ] as const;
  const rows: string[][] = [
    [
      "report_version",
      "time_zone",
      "period_start",
      "period_end",
      "domain",
      "record_type",
      "record_id",
      "label",
      "local_date",
      "start_at_utc",
      "end_at_utc",
      "status",
      "amount_minor",
      "currency",
      "source",
      "metric",
      "value",
    ],
  ];
  for (const event of contributors.events) {
    rows.push([
      ...prefix,
      "agenda",
      event.kind === "date_only" ? "event_date_only" : "event_instant",
      event.id,
      event.title,
      event.kind === "date_only" ? event.localDate : "",
      event.kind === "instant" ? iso(event.startAtUtc) : "",
      event.kind === "instant" ? iso(event.endAtUtc) : "",
      event.status,
      "",
      "",
      "manual_command",
      "",
      "",
    ]);
  }
  for (const task of contributors.tasks) {
    rows.push([
      ...prefix,
      "tasks",
      `task_${task.dueKind}`,
      task.id,
      task.title,
      task.dueKind === "date_only" ? task.dueDateLocal : "",
      task.dueKind === "instant" ? iso(task.dueAtUtc) : "",
      "",
      task.status,
      "",
      "",
      "manual_command",
      "",
      "",
    ]);
  }
  for (const shift of contributors.work.plannedShifts) {
    rows.push([
      ...prefix,
      "work",
      "planned_shift",
      shift.id,
      shift.title,
      "",
      iso(shift.startAtUtc),
      iso(shift.endAtUtc),
      "active",
      "",
      "",
      "manual_command",
      "scheduled_minutes",
      "",
    ]);
  }
  for (const line of contributors.work.lines) {
    rows.push([
      ...prefix,
      "work",
      "work_log",
      line.workLogId,
      `${line.ruleName} v${String(line.ruleVersion)} ${line.breakTreatment}`,
      "",
      iso(line.clippedStartAtUtc),
      iso(line.clippedEndAtUtc),
      "active",
      "",
      "",
      "manual_command_rule_snapshot",
      "counted_minutes",
      String(line.countedMinutes),
    ]);
  }
  for (const entry of contributors.work.breaks) {
    rows.push([
      ...prefix,
      "work",
      "work_break",
      entry.id,
      entry.workLogId,
      "",
      iso(entry.startAtUtc),
      iso(entry.endAtUtc),
      "active",
      "",
      "",
      "manual_command",
      "break_minutes",
      "",
    ]);
  }
  for (const entry of contributors.finance) {
    rows.push([
      ...prefix,
      "finance",
      entry.kind,
      entry.id,
      entry.category,
      entry.localDate,
      "",
      "",
      entry.status,
      String(entry.amountMinor),
      entry.currency,
      entry.source,
      "",
      "",
    ]);
  }
  const metrics = [
    ["agenda", "active_event_count", contributors.events.length],
    ["tasks", "due_task_count", contributors.tasks.length],
    [
      "tasks",
      "open_due_task_count",
      contributors.tasks.filter((entry) => entry.status === "open").length,
    ],
    [
      "tasks",
      "completed_due_task_count",
      contributors.tasks.filter((entry) => entry.status === "completed").length,
    ],
    ["work", "scheduled_minutes", contributors.work.totals.scheduledMinutes],
    [
      "work",
      "actual_gross_minutes",
      contributors.work.totals.actualGrossMinutes,
    ],
    ["work", "break_minutes", contributors.work.totals.breakMinutes],
    ["work", "counted_minutes", contributors.work.totals.countedMinutes],
  ] as const;
  for (const [domain, metric, value] of metrics) {
    rows.push([
      ...prefix,
      domain,
      "summary",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "calculated",
      metric,
      String(value),
    ]);
  }
  for (const total of calculateFinanceTotals(contributors.finance)) {
    for (const [metric, value] of [
      ["income_minor", total.incomeMinor],
      ["expense_minor", total.expenseMinor],
      ["net_minor", total.netMinor],
    ] as const) {
      rows.push([
        ...prefix,
        "finance",
        "summary",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        total.currency,
        "calculated",
        metric,
        value.toString(),
      ]);
    }
  }
  return rows;
}

async function loadContributors(
  scope: UserScope,
  window: BaseReportWindow,
  dependencies: ManageReportsDependencies,
): Promise<ReportContributors | null> {
  const limit = baseReportContributorLimit + 1;
  const [events, tasks, work, finance] = await Promise.all([
    dependencies.events.listForRange(scope, window, limit),
    dependencies.tasks.listForRange(scope, window, limit),
    dependencies.work.report(scope, window),
    dependencies.finance.listForReport(scope, window, limit),
  ]);
  if (
    events.length > baseReportContributorLimit ||
    tasks.length > baseReportContributorLimit ||
    finance.length > baseReportContributorLimit ||
    work === null
  ) {
    return null;
  }
  return { events, tasks, work, finance };
}

export async function manageReports(
  request: ManageReportsRequest,
  dependencies: ManageReportsDependencies,
): Promise<ManageReportsResult> {
  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: "reports:read",
  });
  if (request.command.kind === "reports.invalid") return usage;
  const profile = await dependencies.preferences.get(request.scope);
  if (profile === null) {
    return "Prima configura lingua, timezone, formato ora e valuta con /impostazioni imposta.";
  }
  const window = baseReportWindow({
    startDate: request.command.startDate,
    endDate: request.command.endDate,
    timeZone: profile.timeZone,
  });
  if (!window.ok) return validationMessage(window.issue);
  const contributors = await loadContributors(
    request.scope,
    window.value,
    dependencies,
  );
  if (contributors === null) {
    return "Report troppo esteso: oltre 500 contributori in almeno un dominio. Restringi il periodo.";
  }
  if (request.command.kind === "reports.summary") {
    return renderSummary(window.value, contributors);
  }
  const content = renderCsv(csvRows(window.value, contributors));
  if (new TextEncoder().encode(content).byteLength > baseReportMaxCsvBytes) {
    return "CSV troppo grande: restringi il periodo richiesto.";
  }
  return {
    kind: "document",
    fileName: `tessavio-report-${window.value.startDate}-${window.value.endDate}.csv`,
    mimeType: "text/csv",
    content,
    caption: `Report Tessavio ${window.value.startDate} → ${window.value.endDate} (${window.value.timeZone}, ${baseReportPolicyVersion}).`,
  };
}

export function reportCommandRegistration(
  dependencies: ManageReportsDependencies,
): CommandRegistration {
  return commandRegistration<ReportCommand>(
    reportCommandKinds,
    isReportCommand,
    (command, context) =>
      manageReports(
        {
          actorUserId: context.actorUserId,
          scope: context.scope,
          command,
        },
        dependencies,
      ),
  );
}
