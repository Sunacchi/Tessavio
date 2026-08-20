import { z } from "zod";

/**
 * Contratto C1 congelato in ADR-0023. Il modello produce **testo grezzo** degli
 * slot: mai un istante ISO, mai un importo in unità minori, mai un ID. La
 * risoluzione resta nel codice deterministico.
 */
export const aiProposalSchemaVersion = "c1.v1";

export const c1Actions = [
  "events.create",
  "events.cancel",
  "reminders.create",
  "reminders.cancel",
  "tasks.create",
  "tasks.complete",
  "query.today",
] as const;

/**
 * Estensione C1.2: lavoro, finanze e liste. Riusa validator, policy e harness
 * senza modificarli; l'unica cosa che cresce è l'enum e i suoi slot.
 */
export const c12Actions = [
  ...c1Actions,
  "finance.create",
  "lists.create",
  "lists.item.create",
  "work.shift.create",
] as const;

export type AiAction = (typeof c12Actions)[number];

/** Classe di rischio: è un dato versionato, non un'inferenza sul nome. */
export type AiRiskClass = "read" | "create" | "state_change" | "destructive";

const riskClasses: Readonly<Record<AiAction, AiRiskClass>> = {
  "events.create": "create",
  "events.cancel": "destructive",
  "reminders.create": "create",
  "reminders.cancel": "destructive",
  "tasks.create": "create",
  "tasks.complete": "state_change",
  "query.today": "read",
  "finance.create": "create",
  "lists.create": "create",
  "lists.item.create": "create",
  "work.shift.create": "create",
};

export function riskClassOf(action: AiAction): AiRiskClass {
  return riskClasses[action];
}

export const maxProposalsPerMessage = 3;
export const maxEntitiesPerMessage = 3;
export const maxAssumptionsPerProposal = 4;

/**
 * Payload piatto, variante (A) di ADR-0023: uno slot per concetto, tutti
 * nullable. Quali slot siano obbligatori per una data azione lo impone il
 * validator semantico, non lo schema.
 */
export const aiPayloadSchema = z
  .object({
    title: z.string().nullable(),
    text: z.string().nullable(),
    when: z.string().nullable(),
    when_end: z.string().nullable(),
    all_day: z.boolean().nullable(),
    priority: z.string().nullable(),
    reference: z.string().nullable(),
    amount: z.string().nullable(),
    category: z.string().nullable(),
    entry_kind: z.string().nullable(),
  })
  .strict();

export type AiPayload = z.infer<typeof aiPayloadSchema>;

function proposalSchema(actions: readonly [AiAction, ...AiAction[]]) {
  return z
    .object({
      action: z.enum(actions),
      confidence: z.enum(["high", "low"]),
      assumptions: z.array(z.string()),
      payload: aiPayloadSchema,
    })
    .strict();
}

/**
 * Busta versionata: lo schema strict impone un oggetto alla radice, quindi
 * `ActionProposal[]` nudo non è rappresentabile.
 */
export function aiEnvelopeSchema(
  actions: readonly AiAction[] = c12Actions,
): z.ZodType<AiProposalEnvelope> {
  const enabled = enabledTuple(actions);
  return z
    .object({
      schema_version: z.literal(aiProposalSchemaVersion),
      proposals: z.array(proposalSchema(enabled)).max(maxProposalsPerMessage),
      clarification: z.string().nullable(),
    })
    .strict();
}

export interface AiProposal {
  readonly action: AiAction;
  readonly confidence: "high" | "low";
  readonly assumptions: readonly string[];
  readonly payload: AiPayload;
}

export interface AiProposalEnvelope {
  readonly schema_version: typeof aiProposalSchemaVersion;
  readonly proposals: readonly AiProposal[];
  readonly clarification: string | null;
}

function enabledTuple(
  actions: readonly AiAction[],
): readonly [AiAction, ...AiAction[]] {
  const first = actions[0];
  if (first === undefined) {
    throw new RangeError("almeno un'azione deve essere abilitata");
  }
  return [first, ...actions.slice(1)];
}
