import { describe, expect, it } from "vitest";
import {
  aiEnvelopeSchema,
  aiProposalSchemaVersion,
  c1Actions,
} from "../../src/domains/ai/proposal";
import {
  buildStrictProposalSchema,
  schemaDepth,
  strictSchemaMaxDepth,
} from "../../src/domains/ai/strict-schema";

type Node = Record<string, unknown>;

function walk(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Node;
  visit(record);
  for (const value of Object.values(record)) walk(value, visit);
}

describe("C1 strict JSON Schema conformance", () => {
  const schema = buildStrictProposalSchema(c1Actions);

  it("ha un oggetto alla radice, come impone lo strict mode", () => {
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual([
      "schema_version",
      "proposals",
      "clarification",
    ]);
  });

  it("mette ogni proprietà in required e vieta proprietà extra ovunque", () => {
    walk(schema, (node) => {
      if (node.type !== "object") return;
      const properties = node.properties as Node | undefined;
      expect(node.additionalProperties).toBe(false);
      expect(node.required).toEqual(Object.keys(properties ?? {}));
    });
  });

  it("non usa vincoli semantici che il provider non applica", () => {
    const forbidden = [
      "$schema",
      "pattern",
      "format",
      "minimum",
      "maximum",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "default",
    ];
    walk(schema, (node) => {
      for (const keyword of forbidden) {
        expect(Object.hasOwn(node, keyword)).toBe(false);
      }
    });
  });

  it("resta entro il limite di profondità e non usa $ref", () => {
    expect(schemaDepth(schema)).toBeLessThanOrEqual(strictSchemaMaxDepth);
    walk(schema, (node) => {
      expect(Object.hasOwn(node, "$ref")).toBe(false);
      expect(Object.hasOwn(node, "$defs")).toBe(false);
    });
  });

  it("rappresenta gli slot opzionali come anyOf con null", () => {
    const proposals = schema.proposals as Node | undefined;
    const items = (schema.properties as Node).proposals as Node;
    const payload = (((items.items as Node).properties as Node).payload as Node)
      .properties as Node;
    expect(proposals).toBeUndefined();
    for (const slot of Object.values(payload)) {
      expect((slot as Node).anyOf).toBeDefined();
    }
  });

  it("lo schema Zod rifiuta un'azione fuori dall'enum abilitato", () => {
    const parsed = aiEnvelopeSchema(["events.create"]).safeParse({
      schema_version: aiProposalSchemaVersion,
      proposals: [
        {
          action: "events.cancel",
          confidence: "high",
          assumptions: [],
          payload: {
            title: null,
            text: null,
            when: null,
            when_end: null,
            all_day: null,
            priority: null,
            reference: "riunione",
          },
        },
      ],
      clarification: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("lo schema Zod rifiuta uno slot sconosciuto nel payload", () => {
    const parsed = aiEnvelopeSchema(c1Actions).safeParse({
      schema_version: aiProposalSchemaVersion,
      proposals: [
        {
          action: "events.create",
          confidence: "high",
          assumptions: [],
          payload: {
            title: "Dentista",
            text: null,
            when: "domani alle 15",
            when_end: null,
            all_day: null,
            priority: null,
            reference: null,
            event_id: "evt-1",
          },
        },
      ],
      clarification: null,
    });
    expect(parsed.success).toBe(false);
  });
});
