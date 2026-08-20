import {
  maxAssumptionsPerProposal,
  riskClassOf,
  type AiAction,
  type AiPayload,
  type AiProposal,
  type AiProposalEnvelope,
} from "./proposal";
import { resolveMoneySlot } from "./money-slot";
import { resolveTimeSlot, type TimeSlotIssue } from "./time-slot";

/**
 * Validator semantico: puro, deterministico, senza I/O. Le candidate per la
 * risoluzione dei riferimenti arrivano già lette dall'application layer con lo
 * scope del tenant: qui non si accede a nessun repository.
 */
export interface ProposalCandidate {
  readonly id: string;
  readonly label: string;
}

export interface ProposalCandidates {
  readonly events: readonly ProposalCandidate[];
  readonly reminders: readonly ProposalCandidate[];
  readonly tasks: readonly ProposalCandidate[];
  readonly lists: readonly ProposalCandidate[];
}

export interface ProposalValidationContext {
  readonly enabledActions: readonly AiAction[];
  readonly timeZone: string;
  readonly referenceInstant: Date;
  readonly defaultCurrency: string;
  readonly candidates: ProposalCandidates;
}

export interface ResolvedSlots {
  readonly title: string | null;
  readonly text: string | null;
  readonly startLocal: string | null;
  readonly endLocal: string | null;
  readonly localDate: string | null;
  readonly due: string | null;
  readonly priority: string | null;
  readonly entityId: string | null;
  /** Unità minori intere, come stringa: mai un `float` (invariante 8). */
  readonly amountMinor: string | null;
  readonly currency: string | null;
  readonly entryKind: string | null;
  readonly category: string | null;
}

export type ClarifyReason =
  | "amount_unparsable"
  | "amount_out_of_range"
  | "reference_not_found"
  | "reference_ambiguous"
  | "time_unparsable"
  | "time_needs_hour"
  | "time_dst_gap"
  | "time_out_of_range"
  | "missing_slot";

export type RejectReason =
  | "action_not_enabled"
  | "extraneous_slot"
  | "invalid_slot"
  | "duplicate_in_batch"
  | "batch_limit";

export type ProposalValidation =
  | {
      readonly outcome: "valid";
      readonly action: AiAction;
      readonly slots: ResolvedSlots;
      readonly resolution: "resolved" | "assumed";
      readonly entityCount: number;
      readonly assumptions: readonly string[];
    }
  | {
      readonly outcome: "clarify";
      readonly action: AiAction;
      readonly reason: ClarifyReason;
      readonly question: string;
    }
  | {
      readonly outcome: "reject";
      readonly action: AiAction;
      readonly reason: RejectReason;
    };

const emptySlots: ResolvedSlots = {
  title: null,
  text: null,
  startLocal: null,
  endLocal: null,
  localDate: null,
  due: null,
  priority: null,
  entityId: null,
  amountMinor: null,
  currency: null,
  entryKind: null,
  category: null,
};

/** Slot ammessi per azione: tutto il resto è uno slot estraneo, quindi rifiuto. */
const allowedSlots: Readonly<Record<AiAction, readonly (keyof AiPayload)[]>> = {
  "events.create": ["title", "when", "when_end", "all_day"],
  "events.cancel": ["reference"],
  "reminders.create": ["text", "when"],
  "reminders.cancel": ["reference"],
  "tasks.create": ["title", "when", "priority"],
  "tasks.complete": ["reference"],
  "query.today": [],
  "finance.create": ["amount", "entry_kind", "category", "when"],
  "lists.create": ["title"],
  "lists.item.create": ["reference", "text"],
  "work.shift.create": ["title", "when", "when_end"],
};

const defaultEventDurationMinutes = 60;
const textMaxLength = 200;

function nonEmpty(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function extraneousSlot(proposal: AiProposal): boolean {
  const allowed = new Set<string>(allowedSlots[proposal.action]);
  return Object.entries(proposal.payload).some(
    ([slot, value]) => value !== null && !allowed.has(slot),
  );
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function matchCandidates(
  reference: string,
  candidates: readonly ProposalCandidate[],
): readonly ProposalCandidate[] {
  const needle = normalizeLabel(reference);
  if (needle.length === 0) return [];
  const exact = candidates.filter(
    (candidate) => normalizeLabel(candidate.label) === needle,
  );
  if (exact.length > 0) return exact;
  const contained = candidates.filter((candidate) =>
    normalizeLabel(candidate.label).includes(needle),
  );
  if (contained.length > 0) return contained;
  // Il riferimento può essere più verboso dell'etichetta ("l'appuntamento
  // riunione con marco"): resta una corrispondenza deterministica, e se ne
  // trova più di una l'esito è comunque `clarify`.
  return candidates.filter((candidate) =>
    needle.includes(normalizeLabel(candidate.label)),
  );
}

function timeIssueToClarify(issue: TimeSlotIssue): {
  readonly reason: ClarifyReason;
  readonly question: string;
} {
  switch (issue) {
    case "ambiguous_local_time":
      return {
        reason: "time_dst_gap",
        question:
          "Quell'ora non esiste o è ambigua per il cambio ora: quale ora civile intendi?",
      };
    case "out_of_range":
      return {
        reason: "time_out_of_range",
        question: "La data sembra fuori intervallo: puoi indicarla per esteso?",
      };
    case "time_zone":
      return {
        reason: "time_unparsable",
        question:
          "Configura prima la timezone con /impostazioni imposta it Europe/Rome 24h EUR.",
      };
    case "unparsable":
      return {
        reason: "time_unparsable",
        question: "Quando esattamente? Indica giorno e ora.",
      };
  }
}

function resolveReference(
  proposal: AiProposal,
  candidates: readonly ProposalCandidate[],
): ProposalValidation | { readonly ok: true; readonly id: string } {
  const reference = nonEmpty(proposal.payload.reference);
  if (reference === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "A quale elemento ti riferisci?",
    };
  }
  const matches = matchCandidates(reference, candidates);
  const first = matches[0];
  if (first === undefined) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "reference_not_found",
      question: `Non trovo "${reference}" fra i tuoi elementi attivi. Qual è quello giusto?`,
    };
  }
  if (matches.length > 1) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "reference_ambiguous",
      question: `Ho trovato ${String(matches.length)} elementi che corrispondono a "${reference}". Quale intendi?`,
    };
  }
  return { ok: true, id: first.id };
}

function validateSingle(
  proposal: AiProposal,
  context: ProposalValidationContext,
): ProposalValidation {
  if (!context.enabledActions.includes(proposal.action)) {
    return {
      outcome: "reject",
      action: proposal.action,
      reason: "action_not_enabled",
    };
  }
  if (extraneousSlot(proposal)) {
    return {
      outcome: "reject",
      action: proposal.action,
      reason: "extraneous_slot",
    };
  }
  if (proposal.assumptions.length > maxAssumptionsPerProposal) {
    return {
      outcome: "reject",
      action: proposal.action,
      reason: "invalid_slot",
    };
  }

  switch (proposal.action) {
    case "query.today":
      return {
        outcome: "valid",
        action: proposal.action,
        slots: emptySlots,
        resolution: "resolved",
        entityCount: 0,
        assumptions: [],
      };
    case "events.create":
      return validateEventCreate(proposal, context);
    case "reminders.create":
      return validateReminderCreate(proposal, context);
    case "tasks.create":
      return validateTaskCreate(proposal, context);
    case "events.cancel":
      return validateReferenceAction(proposal, context.candidates.events);
    case "reminders.cancel":
      return validateReferenceAction(proposal, context.candidates.reminders);
    case "tasks.complete":
      return validateReferenceAction(proposal, context.candidates.tasks);
    case "finance.create":
      return validateFinanceCreate(proposal, context);
    case "lists.create":
      return validateListCreate(proposal);
    case "lists.item.create":
      return validateListItemCreate(proposal, context);
    case "work.shift.create":
      return validateShiftCreate(proposal, context);
  }
}

function validateFinanceCreate(
  proposal: AiProposal,
  context: ProposalValidationContext,
): ProposalValidation {
  const rawAmount = nonEmpty(proposal.payload.amount);
  if (rawAmount === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Quanto hai speso o incassato?",
    };
  }
  const money = resolveMoneySlot(rawAmount, {
    defaultCurrency: context.defaultCurrency,
  });
  if (!money.ok) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason:
        money.issue === "out_of_range"
          ? "amount_out_of_range"
          : "amount_unparsable",
      question:
        money.issue === "out_of_range"
          ? "L'importo sembra fuori scala: puoi ripeterlo?"
          : "Non ho capito l'importo: scrivilo per esteso, per esempio 12,50 euro.",
    };
  }
  const category = nonEmpty(proposal.payload.category);
  if (category === null || category.length > 100) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "In che categoria lo metto?",
    };
  }
  const rawKind = nonEmpty(proposal.payload.entry_kind)?.toLowerCase() ?? null;
  const entryKind =
    rawKind === null || rawKind === "spesa" || rawKind === "expense"
      ? "expense"
      : rawKind === "entrata" || rawKind === "income"
        ? "income"
        : null;
  if (entryKind === null) {
    return {
      outcome: "reject",
      action: proposal.action,
      reason: "invalid_slot",
    };
  }
  const assumptions = [...proposal.assumptions];
  if (rawKind === null) assumptions.push("tipo predefinito: spesa");
  if (money.value.currencyFromDefault) {
    assumptions.push(`valuta predefinita: ${money.value.currency}`);
  }

  const rawWhen = nonEmpty(proposal.payload.when);
  let localDate = localDateOf(context.referenceInstant, context.timeZone);
  let assumed = false;
  if (rawWhen === null) {
    assumptions.push(`data predefinita: ${localDate}`);
  } else {
    const slot = resolveTimeSlot(rawWhen, context);
    if (!slot.ok) {
      const clarify = timeIssueToClarify(slot.issue);
      return { outcome: "clarify", action: proposal.action, ...clarify };
    }
    localDate =
      slot.value.kind === "date_only"
        ? slot.value.localDate
        : slot.value.localDateTime.slice(0, 10);
    assumed = slot.value.assumed;
    assumptions.push(...slot.value.assumptions);
  }

  return {
    outcome: "valid",
    action: proposal.action,
    slots: {
      ...emptySlots,
      amountMinor: money.value.amountMinor,
      currency: money.value.currency,
      entryKind,
      category,
      localDate,
    },
    resolution: assumed ? "assumed" : "resolved",
    entityCount: 1,
    assumptions,
  };
}

function validateListCreate(proposal: AiProposal): ProposalValidation {
  const title = validateTitle(proposal, "title");
  if (title === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Come chiamo la lista?",
    };
  }
  return {
    outcome: "valid",
    action: proposal.action,
    slots: { ...emptySlots, title },
    resolution: "resolved",
    entityCount: 1,
    assumptions: [...proposal.assumptions],
  };
}

function validateListItemCreate(
  proposal: AiProposal,
  context: ProposalValidationContext,
): ProposalValidation {
  const text = validateTitle(proposal, "text");
  if (text === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Che cosa aggiungo alla lista?",
    };
  }
  const resolved = resolveReference(proposal, context.candidates.lists);
  if (!("ok" in resolved)) return resolved;
  return {
    outcome: "valid",
    action: proposal.action,
    slots: { ...emptySlots, text, entityId: resolved.id },
    resolution: "resolved",
    entityCount: 1,
    assumptions: [...proposal.assumptions],
  };
}

function validateShiftCreate(
  proposal: AiProposal,
  context: ProposalValidationContext,
): ProposalValidation {
  const title = validateTitle(proposal, "title");
  if (title === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Che nome do al turno?",
    };
  }
  const rawStart = nonEmpty(proposal.payload.when);
  const rawEnd = nonEmpty(proposal.payload.when_end);
  if (rawStart === null || rawEnd === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "time_needs_hour",
      question: "Da che ora a che ora è il turno?",
    };
  }
  const start = resolveTimeSlot(rawStart, context);
  const end = resolveTimeSlot(rawEnd, context);
  if (!start.ok) {
    const clarify = timeIssueToClarify(start.issue);
    return { outcome: "clarify", action: proposal.action, ...clarify };
  }
  if (
    !end.ok ||
    end.value.kind !== "instant" ||
    start.value.kind !== "instant"
  ) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "time_needs_hour",
      question: "Da che ora a che ora è il turno?",
    };
  }
  if (end.value.localDateTime <= start.value.localDateTime) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "time_unparsable",
      question: "La fine del turno non può precedere l'inizio: quando finisce?",
    };
  }
  return {
    outcome: "valid",
    action: proposal.action,
    slots: {
      ...emptySlots,
      title,
      startLocal: start.value.localDateTime,
      endLocal: end.value.localDateTime,
    },
    resolution:
      start.value.assumed || end.value.assumed ? "assumed" : "resolved",
    entityCount: 1,
    assumptions: [
      ...proposal.assumptions,
      ...start.value.assumptions,
      ...end.value.assumptions,
    ],
  };
}

function validateTitle(
  proposal: AiProposal,
  slot: "title" | "text",
): string | null {
  const value = nonEmpty(proposal.payload[slot]);
  if (value === null) return null;
  if (value.length > textMaxLength || hasControlCharacters(value)) return null;
  return value;
}

function validateEventCreate(
  proposal: AiProposal,
  context: ProposalValidationContext,
): ProposalValidation {
  const title = validateTitle(proposal, "title");
  if (title === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Che titolo do all'evento?",
    };
  }
  const when = nonEmpty(proposal.payload.when);
  if (when === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Quando si tiene l'evento?",
    };
  }
  const start = resolveTimeSlot(when, context);
  if (!start.ok) {
    const clarify = timeIssueToClarify(start.issue);
    return { outcome: "clarify", action: proposal.action, ...clarify };
  }
  const assumptions = [...proposal.assumptions, ...start.value.assumptions];
  if (start.value.kind === "date_only" || proposal.payload.all_day === true) {
    const localDate =
      start.value.kind === "date_only"
        ? start.value.localDate
        : start.value.localDateTime.slice(0, 10);
    return {
      outcome: "valid",
      action: proposal.action,
      slots: { ...emptySlots, title, localDate },
      resolution: start.value.assumed ? "assumed" : "resolved",
      entityCount: 1,
      assumptions,
    };
  }

  const rawEnd = nonEmpty(proposal.payload.when_end);
  let endLocal: string;
  // Un default dichiarato (la durata standard) non è un'inferenza: viene
  // mostrato all'utente ma non declassa la risoluzione ad "assumed".
  let assumed = start.value.assumed;
  if (rawEnd === null) {
    endLocal = addMinutes(
      start.value.localDateTime,
      defaultEventDurationMinutes,
    );
    assumptions.push("durata predefinita: 1 ora");
  } else {
    const end = resolveTimeSlot(rawEnd, context);
    if (!end.ok || end.value.kind !== "instant") {
      return {
        outcome: "clarify",
        action: proposal.action,
        reason: "time_needs_hour",
        question: "A che ora finisce l'evento?",
      };
    }
    endLocal = end.value.localDateTime;
    assumed = assumed || end.value.assumed;
    assumptions.push(...end.value.assumptions);
  }
  if (endLocal <= start.value.localDateTime) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "time_unparsable",
      question: "La fine non può precedere l'inizio: quando finisce?",
    };
  }
  return {
    outcome: "valid",
    action: proposal.action,
    slots: {
      ...emptySlots,
      title,
      startLocal: start.value.localDateTime,
      endLocal,
    },
    resolution: assumed ? "assumed" : "resolved",
    entityCount: 1,
    assumptions,
  };
}

function validateReminderCreate(
  proposal: AiProposal,
  context: ProposalValidationContext,
): ProposalValidation {
  const text = validateTitle(proposal, "text");
  if (text === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Che cosa devo ricordarti?",
    };
  }
  const when = nonEmpty(proposal.payload.when);
  if (when === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Quando devo mandartelo?",
    };
  }
  const slot = resolveTimeSlot(when, context);
  if (!slot.ok) {
    const clarify = timeIssueToClarify(slot.issue);
    return { outcome: "clarify", action: proposal.action, ...clarify };
  }
  if (slot.value.kind === "date_only") {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "time_needs_hour",
      question: "A che ora del giorno devo mandartelo?",
    };
  }
  return {
    outcome: "valid",
    action: proposal.action,
    slots: { ...emptySlots, text, startLocal: slot.value.localDateTime },
    resolution: slot.value.assumed ? "assumed" : "resolved",
    entityCount: 1,
    assumptions: [...proposal.assumptions, ...slot.value.assumptions],
  };
}

function validateTaskCreate(
  proposal: AiProposal,
  context: ProposalValidationContext,
): ProposalValidation {
  const title = validateTitle(proposal, "title");
  if (title === null) {
    return {
      outcome: "clarify",
      action: proposal.action,
      reason: "missing_slot",
      question: "Che titolo do alla task?",
    };
  }
  const rawPriority = nonEmpty(proposal.payload.priority);
  const priority = rawPriority === null ? "media" : rawPriority.toLowerCase();
  if (!["bassa", "media", "alta"].includes(priority)) {
    return {
      outcome: "reject",
      action: proposal.action,
      reason: "invalid_slot",
    };
  }
  const assumptions = [...proposal.assumptions];
  if (rawPriority === null) assumptions.push("priorità predefinita: media");

  const when = nonEmpty(proposal.payload.when);
  if (when === null) {
    return {
      outcome: "valid",
      action: proposal.action,
      slots: { ...emptySlots, title, priority, due: "nessuna" },
      resolution: "resolved",
      entityCount: 1,
      assumptions,
    };
  }
  const slot = resolveTimeSlot(when, context);
  if (!slot.ok) {
    const clarify = timeIssueToClarify(slot.issue);
    return { outcome: "clarify", action: proposal.action, ...clarify };
  }
  const due =
    slot.value.kind === "date_only"
      ? slot.value.localDate
      : slot.value.localDateTime;
  return {
    outcome: "valid",
    action: proposal.action,
    slots: { ...emptySlots, title, priority, due },
    resolution: slot.value.assumed ? "assumed" : "resolved",
    entityCount: 1,
    assumptions: [...assumptions, ...slot.value.assumptions],
  };
}

function validateReferenceAction(
  proposal: AiProposal,
  candidates: readonly ProposalCandidate[],
): ProposalValidation {
  const resolved = resolveReference(proposal, candidates);
  if (!("ok" in resolved)) return resolved;
  return {
    outcome: "valid",
    action: proposal.action,
    slots: { ...emptySlots, entityId: resolved.id },
    resolution: "resolved",
    entityCount: 1,
    assumptions: [...proposal.assumptions],
  };
}

function addMinutes(localDateTime: string, minutes: number): string {
  const [datePart, timePart] = localDateTime.split("T");
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);
  const total = (hour ?? 0) * 60 + (minute ?? 0) + minutes;
  const dayOffset = Math.floor(total / (24 * 60));
  const dayMinutes = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const date = new Date(`${datePart ?? ""}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const shiftedDate = date.toISOString().slice(0, 10);
  const hours = String(Math.trunc(dayMinutes / 60)).padStart(2, "0");
  const remainder = String(dayMinutes % 60).padStart(2, "0");
  return `${shiftedDate}T${hours}:${remainder}`;
}

function signature(validation: ProposalValidation): string {
  return validation.outcome === "valid"
    ? `${validation.action}|${JSON.stringify(validation.slots)}`
    : "";
}

/**
 * Valida l'intero batch: collassa i duplicati e applica i limiti di
 * cardinalità del messaggio.
 */
export function validateProposalBatch(
  envelope: AiProposalEnvelope,
  context: ProposalValidationContext,
): readonly ProposalValidation[] {
  const seen = new Set<string>();
  const results: ProposalValidation[] = [];
  let entities = 0;
  for (const proposal of envelope.proposals) {
    const validation = validateSingle(proposal, context);
    if (validation.outcome === "valid") {
      const key = signature(validation);
      if (seen.has(key)) {
        results.push({
          outcome: "reject",
          action: validation.action,
          reason: "duplicate_in_batch",
        });
        continue;
      }
      seen.add(key);
      entities += validation.entityCount;
      if (entities > maxEntities()) {
        results.push({
          outcome: "reject",
          action: validation.action,
          reason: "batch_limit",
        });
        continue;
      }
    }
    results.push(validation);
  }
  return results;
}

function maxEntities(): number {
  return 3;
}

export function isDestructive(action: AiAction): boolean {
  return riskClassOf(action) === "destructive";
}

/** Data locale civile dell'utente all'istante del messaggio. */
function localDateOf(referenceInstant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceInstant);
}
