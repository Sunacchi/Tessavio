import { z } from "zod";
import type { DeterministicCommand } from "./deterministic-command";
import {
  confirmationPolicyVersion,
  type ConfirmationDecision,
} from "../domains/ai/confirmation-policy";
import { c12Actions, type AiAction } from "../domains/ai/proposal";
import type { ResolvedSlots } from "../domains/ai/validate-proposal";

/**
 * Il piano è ciò che viene persistito **prima** di eseguire: un retry rilegge
 * questo, non richiama il modello.
 */
const slotsSchema = z
  .object({
    title: z.string().nullable(),
    text: z.string().nullable(),
    startLocal: z.string().nullable(),
    endLocal: z.string().nullable(),
    localDate: z.string().nullable(),
    due: z.string().nullable(),
    priority: z.string().nullable(),
    entityId: z.string().nullable(),
    amountMinor: z.string().nullable(),
    currency: z.string().nullable(),
    entryKind: z.string().nullable(),
    category: z.string().nullable(),
  })
  .strict();

const planItemSchema = z
  .object({
    index: z.number().int().nonnegative(),
    action: z.enum(c12Actions),
    decision: z.enum([
      "execute_with_undo",
      "preview_confirm",
      "clarify",
      "reject",
    ]),
    slots: slotsSchema,
    assumptions: z.array(z.string()),
    message: z.string().nullable(),
  })
  .strict();

export const proposalPlanSchema = z
  .object({
    schemaVersion: z.string(),
    policyVersion: z.string(),
    model: z.string(),
    clarification: z.string().nullable(),
    items: z.array(planItemSchema),
  })
  .strict();

export type ProposalPlanItem = z.infer<typeof planItemSchema>;
export type ProposalPlan = z.infer<typeof proposalPlanSchema>;

export function emptyPlan(model: string, schemaVersion: string): ProposalPlan {
  return {
    schemaVersion,
    policyVersion: confirmationPolicyVersion,
    model,
    clarification: null,
    items: [],
  };
}

export function parseProposalPlan(planJson: string): ProposalPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(planJson);
  } catch {
    return null;
  }
  const result = proposalPlanSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Traduce una proposta **già validata** nel comando deterministico equivalente:
 * l'esecuzione passa dallo stesso percorso di un comando esplicito, quindi
 * eredita authorization, idempotenza, audit e Undo del dominio.
 */
export function commandForProposal(
  action: AiAction,
  slots: ResolvedSlots,
): DeterministicCommand | null {
  switch (action) {
    case "query.today":
      return { kind: "events.today" };
    case "events.create": {
      if (slots.title === null) return null;
      if (slots.localDate !== null) {
        return {
          kind: "events.create",
          representation: "date_only",
          localDate: slots.localDate,
          title: slots.title,
        };
      }
      if (slots.startLocal === null || slots.endLocal === null) return null;
      return {
        kind: "events.create",
        representation: "instant",
        startLocal: slots.startLocal,
        endLocal: slots.endLocal,
        title: slots.title,
      };
    }
    case "events.cancel":
      return slots.entityId === null
        ? null
        : { kind: "events.cancel", eventId: slots.entityId };
    case "reminders.create":
      return slots.text === null || slots.startLocal === null
        ? null
        : {
            kind: "reminders.create",
            scheduledLocal: slots.startLocal,
            text: slots.text,
          };
    case "reminders.cancel":
      return slots.entityId === null
        ? null
        : { kind: "reminders.cancel", reminderId: slots.entityId };
    case "tasks.create":
      return slots.title === null ||
        slots.due === null ||
        slots.priority === null
        ? null
        : {
            kind: "tasks.create",
            due: slots.due,
            priority: slots.priority,
            title: slots.title,
          };
    case "tasks.complete":
      return slots.entityId === null
        ? null
        : { kind: "tasks.complete", taskId: slots.entityId };
    case "finance.create":
      return slots.amountMinor === null ||
        slots.currency === null ||
        slots.entryKind === null ||
        slots.category === null ||
        slots.localDate === null
        ? null
        : {
            kind: "finance.create",
            entryKind: slots.entryKind,
            amountMinor: slots.amountMinor,
            currency: slots.currency,
            localDate: slots.localDate,
            category: slots.category,
            merchant: "",
            paymentMethod: "",
            note: "",
          };
    case "lists.create":
      return slots.title === null
        ? null
        : { kind: "lists.create", title: slots.title };
    case "lists.item.create":
      return slots.entityId === null || slots.text === null
        ? null
        : {
            kind: "lists.item.create",
            listId: slots.entityId,
            text: slots.text,
          };
    case "work.shift.create":
      return slots.title === null ||
        slots.startLocal === null ||
        slots.endLocal === null
        ? null
        : {
            kind: "work.shift.create",
            startLocal: slots.startLocal,
            endLocal: slots.endLocal,
            title: slots.title,
          };
  }
}

const actionLabels: Readonly<Record<AiAction, string>> = {
  "events.create": "Nuovo evento",
  "events.cancel": "Annullamento evento",
  "reminders.create": "Nuovo promemoria",
  "reminders.cancel": "Annullamento promemoria",
  "tasks.create": "Nuova task",
  "tasks.complete": "Task completata",
  "query.today": "Agenda di oggi",
  "finance.create": "Nuovo movimento",
  "lists.create": "Nuova lista",
  "lists.item.create": "Nuovo elemento in lista",
  "work.shift.create": "Nuovo turno pianificato",
};

/** Che cosa verrà modificato, in chiaro, prima di modificarlo. */
export function describeProposal(item: ProposalPlanItem): string {
  const parts: string[] = [actionLabels[item.action]];
  if (item.slots.title !== null) parts.push(`"${item.slots.title}"`);
  if (item.slots.text !== null) parts.push(`"${item.slots.text}"`);
  if (item.slots.startLocal !== null) {
    parts.push(
      item.slots.endLocal === null
        ? item.slots.startLocal
        : `${item.slots.startLocal} → ${item.slots.endLocal}`,
    );
  }
  if (item.slots.localDate !== null) {
    parts.push(`${item.slots.localDate} (giorno intero)`);
  }
  if (item.slots.due !== null && item.slots.due !== "nessuna") {
    parts.push(`scadenza ${item.slots.due}`);
  }
  if (item.slots.amountMinor !== null && item.slots.currency !== null) {
    parts.push(
      `${formatMinor(item.slots.amountMinor)} ${item.slots.currency}${
        item.slots.entryKind === "income" ? " in entrata" : ""
      }`,
    );
  }
  if (item.slots.category !== null)
    parts.push(`categoria ${item.slots.category}`);
  if (item.slots.entityId !== null) parts.push(`ID: ${item.slots.entityId}`);
  const described = parts.join(" — ");
  return item.assumptions.length === 0
    ? described
    : `${described}\n  Assunzioni: ${item.assumptions.join("; ")}`;
}

/** Rende leggibile un importo senza mai riportarlo in virgola mobile. */
function formatMinor(amountMinor: string): string {
  const digits = amountMinor.padStart(3, "0");
  return `${digits.slice(0, -2)},${digits.slice(-2)}`;
}

export function decisionOf(item: ProposalPlanItem): ConfirmationDecision {
  return item.decision;
}
