import type { FinanceCommand } from "./commands/finance";
import type {
  FinanceMutationContext,
  FinanceRepository,
  MutateFinanceResult,
} from "./ports";
import {
  financeListLimit,
  financeUndoTtlMs,
  validateFinanceDateRange,
  validateFinanceEntry,
  type FinanceCurrencyTotal,
  type FinanceEntryRecord,
  type FinanceValidationIssue,
} from "../domains/finance/finance";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";

export interface ManageFinanceDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly finance: FinanceRepository;
  readonly ids: IdGenerator;
}

export interface ManageFinanceRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly command: FinanceCommand;
}

const usage = [
  "Comandi finanze (importi sempre in unità minori intere):",
  "/finanze crea <spesa|entrata> <importo-minore> <valuta> <YYYY-MM-DD> | Categoria | Esercente-o-- | Metodo-o-- | Note-o--",
  "/finanze leggi <id>",
  "/finanze lista <YYYY-MM-DD> <YYYY-MM-DD>",
  "/finanze correggi <id> <versione> <spesa|entrata> <importo-minore> <valuta> <YYYY-MM-DD> | Categoria | Esercente-o-- | Metodo-o-- | Note-o--",
  "/finanze elimina <id> <versione>",
  "/finanze totali <YYYY-MM-DD> <YYYY-MM-DD>",
].join("\n");
const financeReplyMaxCharacters = 3_500;
const financeReplyContentCharacters = 3_250;

export function renderBoundedFinanceSections(
  heading: string,
  sections: readonly string[],
  sourceTruncated = false,
): string {
  let rendered = heading;
  let included = 0;
  for (const section of sections) {
    const candidate = `${rendered}\n\n${section}`;
    if (candidate.length > financeReplyContentCharacters) break;
    rendered = candidate;
    included += 1;
  }
  const omitted = sections.length - included;
  if (omitted === 0 && !sourceTruncated) return rendered;
  const suffix = sourceTruncated
    ? "Dettaglio parziale: altri movimenti non mostrati. Restringi il periodo."
    : `${String(omitted)} sezioni non mostrate. Restringi il periodo.`;
  return `${rendered}\n\n${suffix}`.slice(0, financeReplyMaxCharacters);
}

function validationMessage(issue: FinanceValidationIssue): string {
  switch (issue) {
    case "kind":
      return `Tipo non valido: usa spesa oppure entrata.\n${usage}`;
    case "amount":
      return "Importo non valido: inserisci un intero positivo in unità minori, massimo 2147483647.";
    case "currency":
      return "Valuta non valida: usa un codice di tre lettere, per esempio EUR.";
    case "date":
      return "Data non valida: usa YYYY-MM-DD.";
    case "category":
      return "Categoria non valida: usa da 1 a 100 caratteri senza caratteri di controllo.";
    case "merchant":
      return "Esercente non valido: usa '-' oppure al massimo 200 caratteri.";
    case "payment_method":
      return "Metodo non valido: usa '-' oppure al massimo 100 caratteri.";
    case "note":
      return "Note non valide: usa '-' oppure al massimo 500 caratteri.";
    case "range_order":
      return "La data finale deve essere uguale o successiva a quella iniziale.";
    case "range_duration":
      return "L'intervallo può coprire al massimo 366 giorni civili inclusivi.";
  }
}

function kindLabel(entry: FinanceEntryRecord): string {
  return entry.kind === "expense" ? "spesa" : "entrata";
}

export function renderFinanceEntry(entry: FinanceEntryRecord): string {
  const optional = [
    entry.merchant === null ? null : `Esercente: ${entry.merchant}`,
    entry.paymentMethod === null ? null : `Metodo: ${entry.paymentMethod}`,
    entry.note === null ? null : `Note: ${entry.note}`,
  ].filter((line): line is string => line !== null);
  return [
    `${kindLabel(entry)} — ${String(entry.amountMinor)} ${entry.currency} (unità minori)`,
    `ID: ${entry.id}`,
    `Data: ${entry.localDate}`,
    `Categoria: ${entry.category}`,
    ...optional,
    "Provenienza: comando manuale",
    `Versione: ${String(entry.version)}`,
    `Stato: ${entry.status === "active" ? "attivo" : "eliminato"}`,
  ].join("\n");
}

function renderTotal(total: FinanceCurrencyTotal): string {
  return [
    `${total.currency}:`,
    `Entrate: ${total.incomeMinor.toString()} unità minori`,
    `Spese: ${total.expenseMinor.toString()} unità minori`,
    `Netto registrato: ${total.netMinor.toString()} unità minori`,
    `Movimenti: ${String(total.entryCount)}`,
  ].join("\n");
}

function mutationContext(
  request: ManageFinanceRequest,
  dependencies: ManageFinanceDependencies,
  now: Date,
): FinanceMutationContext {
  return {
    actorUserId: request.actorUserId,
    correlationId: request.correlationId,
    idempotencyKey: request.idempotencyKey,
    auditId: dependencies.ids.newId(),
    undoToken: `fin_${dependencies.ids.newId()}`,
    now,
    undoExpiresAt: new Date(now.getTime() + financeUndoTtlMs),
  };
}

function undoMessage(result: MutateFinanceResult, now: Date): string {
  if (!("entry" in result)) return "";
  if (
    result.undoToken === null ||
    result.undoExpiresAt === null ||
    result.undoExpiresAt.getTime() <= now.getTime()
  ) {
    return "Undo non disponibile.";
  }
  return `Undo entro 15 minuti: /annulla ${result.undoToken}`;
}

function entryValidation(
  command: Extract<
    FinanceCommand,
    { readonly kind: "finance.create" | "finance.update" }
  >,
) {
  return validateFinanceEntry({
    kind: command.entryKind,
    amountMinor: command.amountMinor,
    currency: command.currency,
    localDate: command.localDate,
    category: command.category,
    merchant: command.merchant,
    paymentMethod: command.paymentMethod,
    note: command.note,
  });
}

export async function manageFinance(
  request: ManageFinanceRequest,
  dependencies: ManageFinanceDependencies,
): Promise<string> {
  const write =
    request.command.kind === "finance.create" ||
    request.command.kind === "finance.update" ||
    request.command.kind === "finance.delete";
  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: write ? "finance:write" : "finance:read",
  });
  if (request.command.kind === "finance.invalid") return usage;
  const now = dependencies.clock.now();
  await dependencies.finance.purgeExpiredUndo(request.scope, now, 100);

  switch (request.command.kind) {
    case "finance.read": {
      const entry = await dependencies.finance.get(
        request.scope,
        request.command.entryId,
      );
      return entry === null
        ? "Movimento non trovato per questo utente."
        : renderFinanceEntry(entry);
    }
    case "finance.list": {
      const range = validateFinanceDateRange(request.command);
      if (!range.ok) return validationMessage(range.issue);
      const entries = await dependencies.finance.list(
        request.scope,
        range.value,
        financeListLimit + 1,
      );
      if (entries.length === 0) {
        return `Movimenti ${range.value.startDate} → ${range.value.endDate}: nessuno.`;
      }
      const visible = entries.slice(0, financeListLimit);
      return renderBoundedFinanceSections(
        `Movimenti ${range.value.startDate} → ${range.value.endDate}:`,
        visible.map(renderFinanceEntry),
        entries.length > financeListLimit,
      );
    }
    case "finance.totals": {
      const range = validateFinanceDateRange(request.command);
      if (!range.ok) return validationMessage(range.issue);
      const totals = await dependencies.finance.totals(
        request.scope,
        range.value,
      );
      return totals.length === 0
        ? `Totali ${range.value.startDate} → ${range.value.endDate}: nessun movimento.`
        : renderBoundedFinanceSections(
            [
              `Totali registrati ${range.value.startDate} → ${range.value.endDate}`,
              "Formula: entrate - spese, per valuta; nessuna conversione valutaria.",
            ].join("\n"),
            totals.map(renderTotal),
          );
    }
    case "finance.create": {
      const validation = entryValidation(request.command);
      if (!validation.ok) return validationMessage(validation.issue);
      const result = await dependencies.finance.create(
        request.scope,
        dependencies.ids.newId(),
        validation.value,
        mutationContext(request, dependencies, now),
      );
      if (!("entry" in result)) return "Movimento non creato.";
      const heading =
        result.outcome === "duplicate"
          ? "Creazione movimento già applicata."
          : "Movimento creato.";
      return `${heading}\n${renderFinanceEntry(result.entry)}\n${undoMessage(result, now)}`;
    }
    case "finance.update": {
      const validation = entryValidation(request.command);
      if (!validation.ok) return validationMessage(validation.issue);
      const result = await dependencies.finance.update(
        request.scope,
        request.command.entryId,
        request.command.expectedVersion,
        validation.value,
        mutationContext(request, dependencies, now),
      );
      if (result.outcome === "not_found") {
        return "Movimento non trovato per questo utente.";
      }
      if (result.outcome === "stale") {
        return "Correzione non applicata: la versione del movimento è cambiata. Rileggilo e riprova.";
      }
      if (!("entry" in result)) return "Movimento non corretto.";
      const heading =
        result.outcome === "duplicate"
          ? "Correzione già applicata."
          : "Movimento corretto.";
      return `${heading}\n${renderFinanceEntry(result.entry)}\n${undoMessage(result, now)}`;
    }
    case "finance.delete": {
      const result = await dependencies.finance.delete(
        request.scope,
        request.command.entryId,
        request.command.expectedVersion,
        mutationContext(request, dependencies, now),
      );
      if (result.outcome === "not_found") {
        return "Movimento non trovato per questo utente.";
      }
      if (result.outcome === "stale") {
        return "Eliminazione non applicata: la versione del movimento è cambiata. Rileggilo e riprova.";
      }
      if (!("entry" in result)) return "Movimento non eliminato.";
      const heading =
        result.outcome === "duplicate"
          ? "Eliminazione già applicata."
          : "Movimento eliminato.";
      return `${heading}\nID: ${result.entry.id}\n${undoMessage(result, now)}`;
    }
  }
}
