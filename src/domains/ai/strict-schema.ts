import { z } from "zod";
import { aiEnvelopeSchema, type AiAction } from "./proposal";

/**
 * Sottoinsieme strict accettato dai provider: radice oggetto, ogni proprietà in
 * `required`, `additionalProperties: false` ovunque, profondità ≤ 5 e nessun
 * vincolo semantico (`pattern`, `format`, `minimum`, `maxItems`, …) che il
 * provider **non** applica e che darebbe una falsa sensazione di sicurezza.
 */
export type JsonSchemaNode = Record<string, unknown>;

export const strictSchemaMaxDepth = 5;

const droppedKeywords = new Set([
  "$schema",
  "$id",
  "default",
  "format",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
]);

function convert(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(convert);
  if (node === null || typeof node !== "object") return node;

  const source = node as Record<string, unknown>;
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (droppedKeywords.has(key)) continue;
    converted[key] = convert(value);
  }
  const properties = converted.properties;
  if (converted.type === "object" && isRecord(properties)) {
    converted.required = Object.keys(properties);
    converted.additionalProperties = false;
  }
  return converted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Profondità reale dell'albero, contando radice = 1. */
export function schemaDepth(node: unknown): number {
  if (Array.isArray(node)) {
    return node.reduce<number>(
      (deepest, child) => Math.max(deepest, schemaDepth(child)),
      0,
    );
  }
  if (!isRecord(node)) return 0;
  const isSchemaObject = node.type === "object" || node.type === "array";
  const childDepth = Object.entries(node).reduce<number>(
    (deepest, [key, value]) =>
      key === "required" || key === "enum"
        ? deepest
        : Math.max(deepest, schemaDepth(value)),
    0,
  );
  return (isSchemaObject ? 1 : 0) + childDepth;
}

/**
 * Schema strict della busta `ActionProposal` per le azioni abilitate.
 * `z.toJSONSchema` da solo non basta: la conversione è esplicita e il test di
 * conformità la verifica sull'output effettivo.
 */
export function buildStrictProposalSchema(
  actions: readonly AiAction[],
): JsonSchemaNode {
  const generated = z.toJSONSchema(aiEnvelopeSchema(actions), {
    target: "draft-2020-12",
    io: "output",
  });
  const converted = convert(generated);
  if (!isRecord(converted)) {
    throw new TypeError("schema strict non rappresentabile");
  }
  return converted;
}
