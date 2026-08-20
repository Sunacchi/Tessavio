import type { AiProviderPort } from "../src/application/ports/ai";
import {
  decideConfirmation,
  type ConfirmationDecision,
} from "../src/domains/ai/confirmation-policy";
import {
  aiEnvelopeSchema,
  c1Actions,
  type AiAction,
} from "../src/domains/ai/proposal";
import {
  validateProposalBatch,
  type ProposalCandidates,
  type ResolvedSlots,
} from "../src/domains/ai/validate-proposal";
import { MockAiProvider } from "../src/infrastructure/ai/mock-provider";
import { buildStrictProposalSchema } from "../src/domains/ai/strict-schema";

/**
 * Harness del benchmark C1. Provider **mock** di default: nessuna rete e
 * nessun costo. Un provider reale si passa esplicitamente, mai per default.
 * Le fixture sono sintetiche: nessun dato personale, nessun segreto.
 */
export interface BenchmarkCase {
  readonly id: string;
  readonly text: string;
  readonly expect: {
    readonly actions: readonly AiAction[];
    readonly decision: ConfirmationDecision | "none";
    readonly slots: Readonly<Record<string, string>>;
  };
}

export interface BenchmarkMetrics {
  readonly cases: number;
  readonly schemaValidRate: number;
  readonly actionExactRate: number;
  readonly slotAccuracy: number;
  readonly falseActionRate: number;
  readonly clarificationPrecision: number;
  readonly multiIntentRecall: number;
  readonly latencyP95Ms: number;
  readonly averageCostMicros: number;
}

export interface BenchmarkReport {
  readonly model: string;
  readonly schemaVersion: string;
  readonly metrics: BenchmarkMetrics;
  readonly failures: readonly string[];
}

const referenceInstant = new Date("2026-08-20T08:00:00Z");
const timeZone = "Europe/Rome";

/** Candidate fisse: la lookup reale è tenant-scoped, qui è deterministica. */
const candidates: ProposalCandidates = {
  events: [{ id: "evt-1", label: "Riunione con Marco" }],
  reminders: [{ id: "rem-1", label: "Comprare il latte" }],
  tasks: [
    { id: "tsk-1", label: "Relazione trimestrale" },
    { id: "tsk-2", label: "Relazione annuale" },
  ],
  lists: [{ id: "lst-1", label: "Spesa" }],
};

/** Il dataset è JSONL: una riga per caso, nessun dato personale. */
export function parseDataset(content: string): BenchmarkCase[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as BenchmarkCase);
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

export async function runBenchmark(
  cases: readonly BenchmarkCase[],
  provider: AiProviderPort = new MockAiProvider(),
  model = "mock/deterministic-v1",
  enabledActions: readonly AiAction[] = c1Actions,
): Promise<BenchmarkReport> {
  const schema = buildStrictProposalSchema(enabledActions);
  const envelopeSchema = aiEnvelopeSchema(enabledActions);
  const latencies: number[] = [];
  const failures: string[] = [];
  let schemaValid = 0;
  let actionExact = 0;
  let slotsChecked = 0;
  let slotsCorrect = 0;
  let falseActions = 0;
  let clarifyExpected = 0;
  let clarifyCorrect = 0;
  let multiIntentExpected = 0;
  let multiIntentFound = 0;
  let costMicros = 0;

  for (const testCase of cases) {
    const startedAt = Date.now();
    const result = await provider.propose({
      context: {
        messageText: testCase.text,
        timeZone,
        localDate: "2026-08-20",
        enabledActions,
      },
      schema,
      model,
      apiKey: null,
      correlationId: `bench-${testCase.id}`,
      maxCostMicros: 5_000,
    });
    latencies.push(Date.now() - startedAt);
    if (result.outcome === "cost_limit") {
      failures.push(`${testCase.id}: tetto di costo insufficiente`);
      continue;
    }
    costMicros += result.costMicros;

    const parsedJson = safeJsonParse(result.rawJson);
    if (parsedJson === undefined) {
      failures.push(`${testCase.id}: JSON non valido`);
      continue;
    }
    const parsed = envelopeSchema.safeParse(parsedJson);
    if (!parsed.success) {
      failures.push(`${testCase.id}: schema non rispettato`);
      continue;
    }
    schemaValid += 1;

    const validations = validateProposalBatch(parsed.data, {
      enabledActions,
      timeZone,
      referenceInstant,
      defaultCurrency: "EUR",
      candidates,
    });
    const decisions = validations.map((validation) =>
      validation.outcome === "valid"
        ? decideConfirmation({
            action: validation.action,
            enabled: enabledActions.includes(validation.action),
            resolution: validation.resolution,
            entityCount: validation.entityCount,
          })
        : validation.outcome,
    );
    const actions = validations.map((validation) => validation.action);
    const expectedActions = testCase.expect.actions;

    if (
      actions.length === expectedActions.length &&
      expectedActions.every((action, index) => actions[index] === action)
    ) {
      actionExact += 1;
    } else {
      failures.push(
        `${testCase.id}: azioni ${actions.join(",") || "(nessuna)"} invece di ${expectedActions.join(",") || "(nessuna)"}`,
      );
    }

    if (expectedActions.length > 1) {
      multiIntentExpected += expectedActions.length;
      multiIntentFound += expectedActions.filter((action) =>
        actions.includes(action),
      ).length;
    }

    const firstValid = validations.find(
      (validation) => validation.outcome === "valid",
    );
    for (const [slot, expected] of Object.entries(testCase.expect.slots)) {
      slotsChecked += 1;
      const actual =
        firstValid?.outcome === "valid"
          ? slotValue(firstValid.slots, slot)
          : null;
      if (actual === expected) slotsCorrect += 1;
      else failures.push(`${testCase.id}: slot ${slot}=${String(actual)}`);
    }

    const expectedDecision = testCase.expect.decision;
    if (expectedDecision === "none") {
      if (decisions.length > 0) {
        falseActions += 1;
        failures.push(`${testCase.id}: azione proposta dove non serviva`);
      }
    } else if (expectedDecision === "clarify") {
      clarifyExpected += 1;
      if (decisions.every((decision) => decision === "clarify")) {
        clarifyCorrect += 1;
      } else if (decisions.includes("execute_with_undo")) {
        falseActions += 1;
        failures.push(`${testCase.id}: eseguito invece di chiedere`);
      }
    } else if (!decisions.includes(expectedDecision)) {
      failures.push(
        `${testCase.id}: decisione ${decisions.join(",") || "(nessuna)"} invece di ${expectedDecision}`,
      );
    }
  }

  const total = cases.length;
  return {
    model,
    schemaVersion: "c1.v1",
    metrics: {
      cases: total,
      schemaValidRate: ratio(schemaValid, total),
      actionExactRate: ratio(actionExact, total),
      slotAccuracy: ratio(slotsCorrect, slotsChecked),
      falseActionRate: ratio(falseActions, total),
      clarificationPrecision: ratio(clarifyCorrect, clarifyExpected),
      multiIntentRecall: ratio(multiIntentFound, multiIntentExpected),
      latencyP95Ms: percentile(latencies, 0.95),
      averageCostMicros: total === 0 ? 0 : Math.round(costMicros / total),
    },
    failures,
  };
}

function ratio(part: number, total: number): number {
  return total === 0 ? 1 : Math.round((part / total) * 1_000) / 1_000;
}

function slotValue(slots: ResolvedSlots, slot: string): string | null {
  const entry: [string, string | null] | undefined = Object.entries(slots).find(
    ([key]) => key === slot,
  );
  const value = entry?.[1] ?? null;
  return value;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
