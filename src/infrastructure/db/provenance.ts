import type { EntityProvenance } from "../../shared/contracts";

/** Valori ammessi dalla colonna `source` delle slice B5/B6. */
export type EntitySourceColumn = "manual_command" | "ai_proposal";

/**
 * Traduce la provenance dell'application layer nel valore della colonna
 * `source`. Le slice B5/B6 chiamano `source` ciò che le slice più recenti
 * chiamano `provenance`: il concetto è uno solo e la conversione vive qui.
 */
export function sourceOf(provenance: EntityProvenance): EntitySourceColumn {
  return provenance === "extracted" ? "ai_proposal" : "manual_command";
}
