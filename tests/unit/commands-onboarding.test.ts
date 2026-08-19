import { describe, expect, it } from "vitest";
import {
  onboardingCommandRoutes,
  parseOnboardingCommand,
} from "../../src/application/commands/onboarding";

describe("C0.1 onboarding command parser", () => {
  it("accetta /start nudo e ignora argomenti", () => {
    expect(parseOnboardingCommand("/start")).toEqual({ kind: "start" });
    expect(parseOnboardingCommand("/start extra")).toEqual({
      kind: "unsupported",
    });
  });

  it("registra soltanto /start", () => {
    expect(onboardingCommandRoutes.map(([keyword]) => keyword)).toEqual([
      "/start",
    ]);
  });
});
