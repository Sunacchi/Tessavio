import { describe, expect, it } from "vitest";
import dataset from "./datasets/c1-core.jsonl?raw";
import baseline from "./baselines/c1-mock-v1.json";
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

  it("non propone mai un'azione dove il testo non ne contiene", async () => {
    const cases = parseDataset(dataset).filter(
      (testCase) => testCase.expect.decision === "none",
    );
    const report = await runBenchmark(cases);
    expect(report.metrics.falseActionRate).toBe(0);
  });
});
