import { describe, expect, it } from "vitest";
import {
  aiCommandRoutes,
  parseAiCommand,
} from "../../src/application/commands/ai";

describe("C1/C2 AI command parser", () => {
  it("distingue stato, proposta, conferma, collegamento e revoca", () => {
    expect(parseAiCommand("/ai")).toEqual({ kind: "ai.status" });
    expect(parseAiCommand("/ai proponi ricordami di uscire")).toEqual({
      kind: "ai.propose",
      text: "ricordami di uscire",
    });
    expect(parseAiCommand("/ai conferma aic_0123456789abcdef")).toEqual({
      kind: "ai.confirm",
      token: "aic_0123456789abcdef",
    });
    expect(parseAiCommand("/ai collega")).toEqual({ kind: "ai.link" });
    expect(parseAiCommand("/ai scollega")).toEqual({ kind: "ai.unlink" });
  });

  it("rifiuta forme incomplete o token non opachi", () => {
    expect(parseAiCommand("/ai proponi")).toEqual({ kind: "ai.invalid" });
    expect(parseAiCommand("/ai conferma corto")).toEqual({
      kind: "ai.invalid",
    });
    expect(parseAiCommand("/ai collega adesso")).toEqual({
      kind: "ai.invalid",
    });
    expect(parseAiCommand("/ai sconosciuto")).toEqual({ kind: "ai.invalid" });
  });

  it("registra soltanto /ai", () => {
    expect(aiCommandRoutes.map(([keyword]) => keyword)).toEqual(["/ai"]);
  });
});
