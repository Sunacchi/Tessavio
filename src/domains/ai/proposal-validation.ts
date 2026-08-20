import type { AiAction, AiProposal } from "./proposal";
import type { TimeSlotIssue } from "./time-slot";

/** Shared types and pure primitives for semantic proposal validation. */
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

export const emptySlots: ResolvedSlots = {
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

const textMaxLength = 200;

export function nonEmpty(value: string | null): string | null {
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
  return candidates.filter((candidate) =>
    needle.includes(normalizeLabel(candidate.label)),
  );
}

export function timeIssueToClarify(issue: TimeSlotIssue): {
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

export function resolveReference(
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

export function validateTitle(
  proposal: AiProposal,
  slot: "title" | "text",
): string | null {
  const value = nonEmpty(proposal.payload[slot]);
  if (value === null) return null;
  if (value.length > textMaxLength || hasControlCharacters(value)) return null;
  return value;
}

/** Data locale civile dell'utente all'istante del messaggio. */
export function localDateOf(referenceInstant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceInstant);
}
