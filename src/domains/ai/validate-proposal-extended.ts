import type { AiProposal } from "./proposal";
import { resolveMoneySlot } from "./money-slot";
import { resolveTimeSlot } from "./time-slot";
import {
  emptySlots,
  localDateOf,
  nonEmpty,
  resolveReference,
  timeIssueToClarify,
  validateTitle,
  type ProposalValidation,
  type ProposalValidationContext,
} from "./proposal-validation";

export function validateFinanceCreate(
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

export function validateListCreate(proposal: AiProposal): ProposalValidation {
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

export function validateListItemCreate(
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

export function validateShiftCreate(
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
