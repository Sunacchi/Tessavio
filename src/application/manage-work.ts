import {
  isWorkCommand,
  workCommandKinds,
  type WorkCommand,
} from "./commands/work";
import type { DayViewContributor } from "./day-view";
import {
  commandRegistration,
  type CommandContext,
  type CommandRegistration,
} from "./handler-registry";
import type { UndoHandler } from "./undo-registry";
import { renderBoundedSections } from "./rendering";
import type {
  MutateWorkResult,
  PreferenceRepository,
  WorkMutationContext,
  WorkRepository,
} from "./ports";
import {
  validateWorkBreak,
  validateWorkInterval,
  validateWorkRule,
  workDayWindow,
  workListLimit,
  workReportWindow,
  workUndoTtlMs,
  type PlannedShiftRecord,
  type WorkBreakRecord,
  type WorkLogRecord,
  type WorkReport,
  type WorkRuleRecord,
  type WorkValidationIssue,
} from "../domains/work/work";
import type { PreferenceProfile } from "../domains/preferences/preferences";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";

export interface ManageWorkDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly preferences: PreferenceRepository;
  readonly work: WorkRepository;
}

export interface ManageWorkRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly command: WorkCommand;
}

const usage = [
  "Comandi lavoro:",
  "/lavoro regola crea <retribuita|non_retribuita> | Nome",
  "/lavoro regola leggi <id> oppure /lavoro regole",
  "/lavoro turno crea <inizio> <fine> | Titolo",
  "/lavoro turno leggi <id>",
  "/lavoro consuntivo crea <inizio> <fine> <regola-id> | Titolo",
  "/lavoro consuntivo leggi <id>",
  "/lavoro pausa crea <consuntivo-id> <inizio> <fine>",
  "/lavoro pausa leggi <id>",
  "/lavoro giorno <YYYY-MM-DD>",
  "/lavoro report <YYYY-MM-DD> <YYYY-MM-DD>",
].join("\n");

const missingPreferences =
  "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.";

function validationMessage(issue: WorkValidationIssue): string {
  switch (issue) {
    case "name":
      return "Nome regola non valido: usa da 1 a 100 caratteri senza caratteri di controllo.";
    case "break_treatment":
      return "Trattamento pause non valido: usa retribuita oppure non_retribuita.";
    case "title":
      return "Titolo non valido: usa da 1 a 200 caratteri senza caratteri di controllo.";
    case "date":
      return "Data non valida: usa YYYY-MM-DD.";
    case "date_time":
      return "Data e ora non valide: usa YYYY-MM-DDTHH:mm.";
    case "ambiguous_local_time":
      return "Ora locale inesistente o ambigua per il cambio DST. Scegli un'ora civile non ambigua.";
    case "time_zone":
      return missingPreferences;
    case "interval_order":
      return "L'orario di fine deve essere successivo all'inizio.";
    case "duration":
      return "L'intervallo non può superare 48 ore effettive.";
    case "range_order":
      return "La data finale del report deve essere uguale o successiva a quella iniziale.";
    case "range_duration":
      return "Il report può coprire al massimo 366 giorni civili inclusivi.";
  }
}

function formatInstant(value: Date, profile: PreferenceProfile): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: profile.timeZone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: profile.hourFormat === "24h" ? "h23" : "h12",
  }).format(value);
}

function formatInterval(
  record: { readonly startAtUtc: Date; readonly endAtUtc: Date },
  profile: PreferenceProfile,
): string {
  return `${formatInstant(record.startAtUtc, profile)} → ${formatInstant(record.endAtUtc, profile)}`;
}

export function renderWorkRule(rule: WorkRuleRecord): string {
  return [
    rule.name,
    `ID: ${rule.id}`,
    `Pause: ${rule.breakTreatment === "paid" ? "conteggiate" : "non conteggiate"}`,
    `Versione regola: ${String(rule.version)}`,
  ].join("\n");
}

export function renderPlannedShift(
  shift: PlannedShiftRecord,
  profile: PreferenceProfile,
): string {
  return [
    shift.title,
    `ID: ${shift.id}`,
    `Pianificato: ${formatInterval(shift, profile)}`,
    `Timezone originale: ${shift.originalTimeZone}`,
  ].join("\n");
}

export function renderWorkLog(
  log: WorkLogRecord,
  profile: PreferenceProfile,
): string {
  return [
    log.title,
    `ID: ${log.id}`,
    `Consuntivo: ${formatInterval(log, profile)}`,
    `Regola snapshot: ${log.ruleName} (${log.ruleId}, v${String(log.ruleVersion)}, ${log.breakTreatment})`,
    `Timezone originale: ${log.originalTimeZone}`,
  ].join("\n");
}

export function renderWorkBreak(
  entry: WorkBreakRecord,
  profile: PreferenceProfile,
): string {
  return [
    `Pausa: ${formatInterval(entry, profile)}`,
    `ID: ${entry.id}`,
    `Consuntivo: ${entry.workLogId}`,
    `Timezone originale: ${entry.originalTimeZone}`,
  ].join("\n");
}

function formatMinutes(minutes: number): string {
  const hours = Math.trunc(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours)}h ${String(remainder)}m (${String(minutes)} min)`;
}

function renderReport(report: WorkReport): string {
  const provenance = report.lines.map(
    (line) =>
      `- ${line.workLogId}: ${String(line.grossMinutes)} lordi - ${String(line.breakMinutes)} pausa; ${String(line.countedMinutes)} conteggiati [${line.ruleName} v${String(line.ruleVersion)}, ${line.breakTreatment}]`,
  );
  const heading = [
    `Report lavoro ${report.window.startDate} → ${report.window.endDate}`,
    `Timezone: ${report.window.timeZone}`,
    `Formula: ${report.policyVersion}`,
    `Pianificato: ${formatMinutes(report.totals.scheduledMinutes)}`,
    `Consuntivo lordo: ${formatMinutes(report.totals.actualGrossMinutes)}`,
    `Pause: ${formatMinutes(report.totals.breakMinutes)}`,
    `Conteggiato/netto: ${formatMinutes(report.totals.countedMinutes)}`,
    `Contributori: ${String(report.plannedShifts.length)} turni, ${String(report.workLogs.length)} consuntivi, ${String(report.breaks.length)} pause.`,
  ].join("\n");
  return renderBoundedSections(heading, [
    ...report.plannedShifts.map((entry) => `Turno contributore: ${entry.id}`),
    ...provenance.map((line) => `Provenienza calcolo: ${line}`),
    ...report.breaks.map((entry) => `Pausa contributrice: ${entry.id}`),
  ]);
}

function mutationContext(
  request: ManageWorkRequest,
  dependencies: ManageWorkDependencies,
  now: Date,
): WorkMutationContext {
  return {
    actorUserId: request.actorUserId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    auditId: dependencies.ids.newId(),
    undoToken: `wrk_${dependencies.ids.newId()}`,
    now,
    undoExpiresAt: new Date(now.getTime() + workUndoTtlMs),
  };
}

function renderCreated<T>(
  result: MutateWorkResult<T>,
  render: (entity: T) => string,
  now: Date,
): string | null {
  if (!("entity" in result)) return null;
  const heading =
    result.outcome === "duplicate"
      ? "Creazione lavoro già applicata."
      : "Elemento lavoro creato.";
  const undo =
    result.undoToken !== null &&
    result.undoExpiresAt !== null &&
    result.undoExpiresAt.getTime() > now.getTime()
      ? `Undo entro 15 minuti: /annulla ${result.undoToken}`
      : "Undo non disponibile.";
  return `${heading}\n${render(result.entity)}\n${undo}`;
}

export async function manageWork(
  request: ManageWorkRequest,
  dependencies: ManageWorkDependencies,
): Promise<string> {
  const write = request.command.kind.endsWith(".create");
  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: write ? "work:write" : "work:read",
  });
  if (request.command.kind === "work.invalid") return usage;
  const profile = await dependencies.preferences.get(request.scope);
  if (profile === null) return missingPreferences;
  const now = dependencies.clock.now();
  await dependencies.work.purgeExpiredUndo(request.scope, now, 100);

  switch (request.command.kind) {
    case "work.rule.read": {
      const rule = await dependencies.work.getRule(
        request.scope,
        request.command.ruleId,
      );
      return rule === null
        ? "Regola lavoro non trovata per questo utente."
        : renderWorkRule(rule);
    }
    case "work.rule.list": {
      const rules = await dependencies.work.listRules(
        request.scope,
        workListLimit + 1,
      );
      return rules.length === 0
        ? "Regole lavoro: nessuna."
        : renderBoundedSections(
            "Regole lavoro:",
            rules.slice(0, workListLimit).map(renderWorkRule),
            rules.length > workListLimit,
          );
    }
    case "work.shift.read": {
      const shift = await dependencies.work.getShift(
        request.scope,
        request.command.shiftId,
      );
      return shift === null
        ? "Turno pianificato non trovato per questo utente."
        : renderPlannedShift(shift, profile);
    }
    case "work.log.read": {
      const log = await dependencies.work.getLog(
        request.scope,
        request.command.workLogId,
      );
      return log === null
        ? "Consuntivo non trovato per questo utente."
        : renderWorkLog(log, profile);
    }
    case "work.break.read": {
      const entry = await dependencies.work.getBreak(
        request.scope,
        request.command.workBreakId,
      );
      return entry === null
        ? "Pausa non trovata per questo utente."
        : renderWorkBreak(entry, profile);
    }
    case "work.day": {
      const window = workDayWindow(request.command.localDate, profile.timeZone);
      if (!window.ok) return validationMessage(window.issue);
      const records = await dependencies.work.listForDay(
        request.scope,
        window.value,
      );
      if (
        records.plannedShifts.length === 0 &&
        records.workLogs.length === 0 &&
        records.breaks.length === 0
      ) {
        return `Lavoro del ${request.command.localDate}: nessun elemento.`;
      }
      return renderBoundedSections(
        `Lavoro del ${request.command.localDate}:`,
        [
          ...records.plannedShifts.map((entry) =>
            renderPlannedShift(entry, profile),
          ),
          ...records.workLogs.map((entry) => renderWorkLog(entry, profile)),
          ...records.breaks.map((entry) => renderWorkBreak(entry, profile)),
        ],
        records.truncated,
      );
    }
    case "work.report": {
      const window = workReportWindow({
        startDate: request.command.startDate,
        endDate: request.command.endDate,
        timeZone: profile.timeZone,
      });
      if (!window.ok) return validationMessage(window.issue);
      const report = await dependencies.work.report(
        request.scope,
        window.value,
      );
      return report === null
        ? "Report troppo esteso: restringi il periodo richiesto."
        : renderReport(report);
    }
    case "work.rule.create": {
      const values = validateWorkRule(request.command);
      if (!values.ok) return validationMessage(values.issue);
      const result = await dependencies.work.createRule(
        request.scope,
        dependencies.ids.newId(),
        values.value,
        mutationContext(request, dependencies, now),
      );
      return renderCreated(result, renderWorkRule, now) ?? "Regola non creata.";
    }
    case "work.shift.create": {
      const values = validateWorkInterval({
        ...request.command,
        timeZone: profile.timeZone,
      });
      if (!values.ok) return validationMessage(values.issue);
      const result = await dependencies.work.createShift(
        request.scope,
        dependencies.ids.newId(),
        values.value,
        mutationContext(request, dependencies, now),
      );
      return (
        renderCreated(
          result,
          (entry) => renderPlannedShift(entry, profile),
          now,
        ) ?? "Turno non creato."
      );
    }
    case "work.log.create": {
      const values = validateWorkInterval({
        ...request.command,
        timeZone: profile.timeZone,
      });
      if (!values.ok) return validationMessage(values.issue);
      const result = await dependencies.work.createLog(
        request.scope,
        dependencies.ids.newId(),
        request.command.ruleId,
        values.value,
        mutationContext(request, dependencies, now),
      );
      if (result.outcome === "rule_not_found") {
        return "Regola lavoro non trovata per questo utente.";
      }
      return (
        renderCreated(result, (entry) => renderWorkLog(entry, profile), now) ??
        "Consuntivo non creato."
      );
    }
    case "work.break.create": {
      const values = validateWorkBreak({
        ...request.command,
        timeZone: profile.timeZone,
      });
      if (!values.ok) return validationMessage(values.issue);
      const result = await dependencies.work.createBreak(
        request.scope,
        dependencies.ids.newId(),
        request.command.workLogId,
        values.value,
        mutationContext(request, dependencies, now),
      );
      if (result.outcome === "work_log_not_found") {
        return "Consuntivo non trovato per questo utente.";
      }
      if (result.outcome === "outside_work_log") {
        return "La pausa deve essere contenuta nel consuntivo.";
      }
      if (result.outcome === "overlapping_break") {
        return "La pausa si sovrappone a una pausa già registrata; gli estremi coincidenti sono ammessi.";
      }
      return (
        renderCreated(
          result,
          (entry) => renderWorkBreak(entry, profile),
          now,
        ) ?? "Pausa non creata."
      );
    }
  }
}

export interface ManageWorkUndoDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly work: WorkRepository;
}

export function workCommandRegistration(
  dependencies: ManageWorkDependencies,
): CommandRegistration {
  return commandRegistration<WorkCommand>(
    workCommandKinds,
    isWorkCommand,
    (command, context) =>
      manageWork(
        {
          actorUserId: context.actorUserId,
          scope: context.scope,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
          command,
        },
        dependencies,
      ),
  );
}

/** Contributo della slice lavoro alla vista di giornata: solo il pianificato. */
export function workDayViewContributor(dependencies: {
  readonly authorizer: Authorizer;
  readonly work: WorkRepository;
}): DayViewContributor {
  return {
    collect: async (request) => {
      await dependencies.authorizer.authorize({
        actorUserId: request.actorUserId,
        scope: request.scope,
        action: "work:read",
      });
      const day = await dependencies.work.listForDay(request.scope, {
        startAtUtc: request.window.startAtUtc,
        endAtUtc: request.window.endAtUtc,
        timeZone: request.profile.timeZone,
      });
      return {
        heading: "Turni pianificati:",
        entries: day.plannedShifts.map((shift) =>
          renderPlannedShift(shift, request.profile),
        ),
        truncated: day.plannedShiftsTruncated,
      };
    },
  };
}

/** La slice lavoro possiede il prefisso `wrk_` dei token di Undo. */
export function workUndoHandler(
  dependencies: ManageWorkUndoDependencies,
): UndoHandler {
  return {
    prefix: "wrk_",
    handle: async (token: string, context: CommandContext) => {
      await dependencies.authorizer.authorize({
        actorUserId: context.actorUserId,
        scope: context.scope,
        action: "work:undo",
      });
      const result = await dependencies.work.undo(context.scope, token, {
        actorUserId: context.actorUserId,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        auditId: dependencies.ids.newId(),
        now: dependencies.clock.now(),
      });
      switch (result.outcome) {
        case "reverted":
          return `Creazione lavoro annullata (${result.entityKind}). ID: ${result.entityId}`;
        case "duplicate":
          return `Undo lavoro già applicato (${result.entityKind}). ID: ${result.entityId}`;
        case "expired":
          return "Undo lavoro scaduto: nessuna modifica applicata.";
        case "used":
          return "Undo lavoro già usato: nessuna modifica applicata.";
        case "stale":
          return "Undo lavoro non applicabile: l'entità è cambiata o ha dati collegati.";
        case "not_found":
          return "Undo lavoro non disponibile per questo utente.";
      }
    },
  };
}
