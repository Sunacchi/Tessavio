import { describe, expect, it } from "vitest";
import { aiRuntimeConfig, parseConfig } from "../../src/shared/config";
import { testConfig } from "../helpers";

const baseEnvironment = {
  APP_ENV: "development",
  TELEGRAM_API_BASE_URL: "https://api.telegram.org",
  WEBHOOK_PATH: "/telegram/webhook",
  WEBHOOK_MAX_BODY_BYTES: "65536",
  WEBHOOK_RATE_LIMIT_MAX: "120",
  WEBHOOK_RATE_WINDOW_SECONDS: "60",
  WEBHOOK_MAX_CONCURRENCY: "16",
  WEBHOOK_LEASE_SECONDS: "30",
  INBOX_LEASE_SECONDS: "60",
  INBOX_RECOVERY_AFTER_SECONDS: "30",
  REMINDER_LEASE_SECONDS: "600",
  REMINDER_ENQUEUE_RECOVERY_SECONDS: "30",
  REMINDER_RETRY_DELAY_SECONDS: "60",
  REMINDER_CLAIM_LIMIT: "100",
  REMINDER_MAX_DELIVERY_ATTEMPTS: "6",
} as unknown as Env;

describe("C1 NO_AI come percorso di prima classe", () => {
  it("la configurazione è valida senza alcuna variabile AI", () => {
    const config = parseConfig(baseEnvironment);
    expect(config.AI_PROVIDER).toBeUndefined();
    expect(aiRuntimeConfig(config).mode).toBe("disabled");
  });

  it("la modalità è derivata dalla presenza del provider, non da un flag", () => {
    const config = parseConfig({
      ...baseEnvironment,
      AI_PROVIDER: "mock",
      AI_MODEL: "mock/deterministic-v1",
    } as unknown as Env);
    const ai = aiRuntimeConfig(config);
    expect(ai.mode).toBe("mock");
    expect(ai.model).toBe("mock/deterministic-v1");
    expect(ai.leaseSeconds).toBeGreaterThan(60);
  });

  it("il lease AI è più lungo di quello dell'inbox, per costruzione", () => {
    const ai = aiRuntimeConfig(
      parseConfig({
        ...baseEnvironment,
        AI_PROVIDER: "mock",
      } as unknown as Env),
    );
    expect(ai.leaseSeconds).toBeGreaterThan(testConfig.INBOX_LEASE_SECONDS);
  });

  it("retention e TTL hanno default espliciti e finiti", () => {
    const ai = aiRuntimeConfig(parseConfig(baseEnvironment));
    expect(ai.proposalRetentionMs).toBe(30 * 24 * 60 * 60 * 1_000);
    expect(ai.confirmationTtlMs).toBe(15 * 60 * 1_000);
    expect(ai.dailyBudgetMicros).toBeGreaterThan(0);
    expect(ai.maxCostMicros).toBeGreaterThan(0);
  });
});
