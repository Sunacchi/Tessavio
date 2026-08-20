import { describe, expect, it } from "vitest";
import dataset from "./datasets/c1-core.jsonl?raw";
import extendedDataset from "./datasets/c1-2-extended.jsonl?raw";
import baseline from "./baselines/c1-mock-v1.json";
import extendedBaseline from "./baselines/c1-2-mock-v1.json";
import { c12Actions } from "../src/domains/ai/proposal";
import { parseDataset, runBenchmark } from "./run";

/**
 * La baseline è registrata **prima** di scegliere un modello: da qui in avanti
 * ogni cambio di prompt, schema o modello va confrontato con questi numeri.
 * Il gate è "nessuna regressione", non "numeri perfetti".
 */
describe("C1 benchmark del provider mock", () => {
  it("non regredisce rispetto alla baseline registrata", async () => {
    const report = await runBenchmark(parseDataset(dataset));
    expect(report.metrics.cases).toBe(baseline.metrics.cases);
    expect(report.metrics.schemaValidRate).toBeGreaterThanOrEqual(
      baseline.metrics.schemaValidRate,
    );
    expect(report.metrics.actionExactRate).toBeGreaterThanOrEqual(
      baseline.metrics.actionExactRate,
    );
    expect(report.metrics.slotAccuracy).toBeGreaterThanOrEqual(
      baseline.metrics.slotAccuracy,
    );
    expect(report.metrics.clarificationPrecision).toBeGreaterThanOrEqual(
      baseline.metrics.clarificationPrecision,
    );
    expect(report.metrics.multiIntentRecall).toBeGreaterThanOrEqual(
      baseline.metrics.multiIntentRecall,
    );
    expect(report.metrics.falseActionRate).toBeLessThanOrEqual(
      baseline.metrics.falseActionRate,
    );
  });

  it("non regredisce sul dataset C1 con l'enum esteso di C1.2", async () => {
    // È il gate della slice C1.2: allargare l'enum non deve peggiorare il
    // tasso di azioni false ne' l'accuratezza sui casi gia' coperti.
    const report = await runBenchmark(
      parseDataset(dataset),
      undefined,
      undefined,
      c12Actions,
    );
    expect(report.metrics.falseActionRate).toBeLessThanOrEqual(
      baseline.metrics.falseActionRate,
    );
    expect(report.metrics.actionExactRate).toBeGreaterThanOrEqual(
      baseline.metrics.actionExactRate,
    );
    expect(report.metrics.slotAccuracy).toBeGreaterThanOrEqual(
      baseline.metrics.slotAccuracy,
    );
  });

  it("registra la baseline delle azioni C1.2", async () => {
    const report = await runBenchmark(
      parseDataset(extendedDataset),
      undefined,
      undefined,
      c12Actions,
    );
    expect(report.metrics.cases).toBe(extendedBaseline.metrics.cases);
    expect(report.metrics.schemaValidRate).toBeGreaterThanOrEqual(
      extendedBaseline.metrics.schemaValidRate,
    );
    expect(report.metrics.actionExactRate).toBeGreaterThanOrEqual(
      extendedBaseline.metrics.actionExactRate,
    );
    expect(report.metrics.slotAccuracy).toBeGreaterThanOrEqual(
      extendedBaseline.metrics.slotAccuracy,
    );
    expect(report.metrics.falseActionRate).toBeLessThanOrEqual(
      extendedBaseline.metrics.falseActionRate,
    );
  });

  it("non propone mai un'azione dove il testo non ne contiene", async () => {
    const cases = [
      ...parseDataset(dataset),
      ...parseDataset(extendedDataset),
    ].filter((testCase) => testCase.expect.decision === "none");
    const report = await runBenchmark(cases, undefined, undefined, c12Actions);
    expect(report.metrics.falseActionRate).toBe(0);
  });
});
