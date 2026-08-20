import { riskClassOf, type AiAction, type AiRiskClass } from "./proposal";

/**
 * Policy di conferma: tabellare e versionata. `confidence` del modello **non**
 * è un input: non autorizza nulla (invariante 4).
 */
export const confirmationPolicyVersion = "c1-policy-v1";

export type ConfirmationDecision =
  "execute_with_undo" | "preview_confirm" | "clarify" | "reject";

export interface ConfirmationPolicyInput {
  readonly action: AiAction;
  readonly enabled: boolean;
  /**
   * `resolved` = ogni slot risolto senza inventare nulla; `assumed` = risolto
   * con un'assunzione dichiarata; `unresolved` = manca un dato essenziale.
   */
  readonly resolution: "resolved" | "assumed" | "unresolved";
  readonly entityCount: number;
}

const neverExecutes: ReadonlySet<AiRiskClass> = new Set(["destructive"]);

export function decideConfirmation(
  input: ConfirmationPolicyInput,
): ConfirmationDecision {
  if (!input.enabled) return "reject";
  if (input.resolution === "unresolved") return "clarify";

  const riskClass = riskClassOf(input.action);
  if (riskClass === "read") {
    return input.entityCount === 0 ? "execute_with_undo" : "reject";
  }
  if (input.entityCount < 1) return "reject";
  if (neverExecutes.has(riskClass)) return "preview_confirm";
  if (input.entityCount > 1) return "preview_confirm";
  if (input.resolution === "assumed") return "preview_confirm";
  return "execute_with_undo";
}

/** Testo mostrato all'utente prima di eseguire o confermare. */
export function decisionHeading(decision: ConfirmationDecision): string {
  switch (decision) {
    case "execute_with_undo":
      return "Fatto";
    case "preview_confirm":
      return "Confermi?";
    case "clarify":
      return "Mi manca un dato";
    case "reject":
      return "Non posso farlo";
  }
}
