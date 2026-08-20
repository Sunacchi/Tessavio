import {
  maxAssumptionsPerProposal,
  riskClassOf,
  type AiAction,
  type AiPayload,
  type AiProposal,
  type AiProposalEnvelope,
} from "./proposal";
import { addMinutesInZone, resolveTimeSlot } from "./time-slot";
import {
  emptySlots,
  nonEmpty,
  resolveReference,
  timeIssueToClarify,
  validateTitle,
  type ProposalCandidate,
  type ProposalValidation,
  type ProposalValidationContext,
} from "./proposal-validation";
import {
  validateFinanceCreate,
  validateListCreate,
  validateListItemCreate,
  validateShiftCreate,
} from "./validate-proposal-extended";

export type {
  ClarifyReason,
  ProposalCandidate,
  ProposalCandidates,
  ProposalValidation,
  ProposalValidationContext,
  RejectReason,
  ResolvedSlots,
} from "./proposal-validation";

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

function extraneousSlot(proposal: AiProposal): boolean {
  const allowed = new Set<string>(allowedSlots[proposal.action]);
  return Object.entries(proposal.payload).some(
    ([slot, value]) => value !== null && !allowed.has(slot),
  );
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
  let assumed = start.value.assumed;
  if (rawEnd === null) {
    const defaultEnd = addMinutesInZone(
      start.value.localDateTime,
      defaultEventDurationMinutes,
      context.timeZone,
    );
    if (defaultEnd === null) {
      return {
        outcome: "clarify",
        action: proposal.action,
        reason: "time_needs_hour",
        question: "A che ora finisce l'evento?",
      };
    }
    endLocal = defaultEnd;
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

function signature(validation: ProposalValidation): string {
  return validation.outcome === "valid"
    ? `${validation.action}|${JSON.stringify(validation.slots)}`
    : "";
}

/** Valida il batch, collassa i duplicati e applica i limiti di cardinalità. */
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
      if (entities > 3) {
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

export function isDestructive(action: AiAction): boolean {
  return riskClassOf(action) === "destructive";
}
