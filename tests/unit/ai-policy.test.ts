import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  confirmationPolicyVersion,
  decideConfirmation,
} from "../../src/domains/ai/confirmation-policy";
import { c1Actions, riskClassOf } from "../../src/domains/ai/proposal";

const actionArbitrary = fc.constantFrom(...c1Actions);
const resolutionArbitrary = fc.constantFrom(
  "resolved" as const,
  "assumed" as const,
  "unresolved" as const,
);

describe("C1 confirmation policy", () => {
  it("è versionata e tabellare", () => {
    expect(confirmationPolicyVersion).toBe("c1-policy-v1");
  });

  it("non esegue mai automaticamente un'azione distruttiva o su più entità", () => {
    fc.assert(
      fc.property(
        actionArbitrary,
        resolutionArbitrary,
        fc.integer({ min: 0, max: 10 }),
        fc.boolean(),
        (action, resolution, entityCount, enabled) => {
          const decision = decideConfirmation({
            action,
            enabled,
            resolution,
            entityCount,
          });
          const destructive = riskClassOf(action) === "destructive";
          if (destructive || entityCount > 1) {
            expect(decision).not.toBe("execute_with_undo");
          }
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });

  it("esegue solo ciò che è risolto, abilitato, non distruttivo e su una sola entità", () => {
    fc.assert(
      fc.property(
        actionArbitrary,
        resolutionArbitrary,
        fc.integer({ min: 0, max: 4 }),
        fc.boolean(),
        (action, resolution, entityCount, enabled) => {
          const decision = decideConfirmation({
            action,
            enabled,
            resolution,
            entityCount,
          });
          if (decision !== "execute_with_undo") return true;
          expect(enabled).toBe(true);
          expect(resolution).not.toBe("unresolved");
          expect(riskClassOf(action)).not.toBe("destructive");
          expect(entityCount).toBeLessThanOrEqual(1);
          // Solo una lettura può essere eseguita con un'assunzione: una
          // scrittura assunta passa sempre dalla preview.
          if (riskClassOf(action) !== "read") {
            expect(resolution).toBe("resolved");
            expect(entityCount).toBe(1);
          }
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });

  it("rifiuta un'azione non abilitata e chiede chiarimenti se manca un dato", () => {
    expect(
      decideConfirmation({
        action: "events.create",
        enabled: false,
        resolution: "resolved",
        entityCount: 1,
      }),
    ).toBe("reject");
    expect(
      decideConfirmation({
        action: "events.create",
        enabled: true,
        resolution: "unresolved",
        entityCount: 1,
      }),
    ).toBe("clarify");
  });

  it("porta in preview un'azione risolta con assunzioni", () => {
    expect(
      decideConfirmation({
        action: "tasks.create",
        enabled: true,
        resolution: "assumed",
        entityCount: 1,
      }),
    ).toBe("preview_confirm");
  });

  it("esegue la lettura di sola consultazione senza toccare entità", () => {
    expect(
      decideConfirmation({
        action: "query.today",
        enabled: true,
        resolution: "resolved",
        entityCount: 0,
      }),
    ).toBe("execute_with_undo");
  });
});
