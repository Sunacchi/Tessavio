import { z } from "zod";

const positiveIntegerString = z
  .string()
  .regex(/^\d+$/u)
  .transform(Number)
  .pipe(z.number().int().positive());

const configSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]),
  TELEGRAM_API_BASE_URL: z.url().refine((url) => url.startsWith("https://")),
  WEBHOOK_PATH: z.string().startsWith("/"),
  WEBHOOK_MAX_BODY_BYTES: positiveIntegerString.pipe(z.number().max(1_048_576)),
  WEBHOOK_RATE_LIMIT_MAX: positiveIntegerString.pipe(z.number().max(10_000)),
  WEBHOOK_RATE_WINDOW_SECONDS: positiveIntegerString.pipe(
    z.number().max(3_600),
  ),
  WEBHOOK_MAX_CONCURRENCY: positiveIntegerString.pipe(z.number().max(1_000)),
  WEBHOOK_LEASE_SECONDS: positiveIntegerString.pipe(z.number().max(300)),
  INBOX_LEASE_SECONDS: positiveIntegerString.pipe(z.number().max(3_600)),
  INBOX_RECOVERY_AFTER_SECONDS: positiveIntegerString.pipe(
    z.number().max(3_600),
  ),
  REMINDER_LEASE_SECONDS: positiveIntegerString.pipe(z.number().max(86_400)),
  REMINDER_ENQUEUE_RECOVERY_SECONDS: positiveIntegerString.pipe(
    z.number().max(3_600),
  ),
  REMINDER_RETRY_DELAY_SECONDS: positiveIntegerString.pipe(
    z.number().max(3_600),
  ),
  REMINDER_CLAIM_LIMIT: positiveIntegerString.pipe(z.number().max(100)),
  REMINDER_MAX_DELIVERY_ATTEMPTS: positiveIntegerString.pipe(
    z.number().max(100),
  ),
  // Phase C: ogni variabile AI è opzionale. NO_AI è un percorso di prima
  // classe, non un caso di errore: senza queste variabili il Worker parte e il
  // core deterministico funziona.
  AI_PROVIDER: z.enum(["mock", "openrouter"]).optional(),
  AI_MODEL: z.string().min(1).max(128).optional(),
  AI_LEASE_SECONDS: positiveIntegerString
    .pipe(z.number().max(3_600))
    .optional(),
  AI_MAX_COST_MICROS: positiveIntegerString
    .pipe(z.number().max(10_000_000))
    .optional(),
  AI_DAILY_BUDGET_MICROS: positiveIntegerString
    .pipe(z.number().max(100_000_000))
    .optional(),
  AI_PROPOSAL_RETENTION_DAYS: positiveIntegerString
    .pipe(z.number().max(365))
    .optional(),
  AI_CONFIRMATION_TTL_MINUTES: positiveIntegerString
    .pipe(z.number().max(1_440))
    .optional(),
  AI_OAUTH_SESSION_TTL_MINUTES: positiveIntegerString
    .pipe(z.number().max(60))
    .optional(),
  AI_REQUEST_TIMEOUT_MS: positiveIntegerString
    .pipe(z.number().max(120_000))
    .optional(),
  AI_PUBLIC_BASE_URL: z
    .url()
    .refine((url) => url.startsWith("https://"))
    .optional(),
  AI_OPENROUTER_BASE_URL: z
    .url()
    .refine((url) => url.startsWith("https://"))
    .optional(),
  AI_KEK: z.string().min(1).max(256).optional(),
  AI_KEK_VERSION: positiveIntegerString.pipe(z.number().max(1_000)).optional(),
  AI_KEK_PREVIOUS: z.string().min(1).max(256).optional(),
  AI_KEK_PREVIOUS_VERSION: positiveIntegerString
    .pipe(z.number().max(1_000))
    .optional(),
});

export type AppConfig = z.output<typeof configSchema>;

export function parseConfig(env: Env): AppConfig {
  return configSchema.parse(env);
}

export type AiMode = "disabled" | "mock" | "openrouter";

export interface AiRuntimeConfig {
  readonly mode: AiMode;
  readonly model: string;
  readonly leaseSeconds: number;
  readonly maxCostMicros: number;
  readonly dailyBudgetMicros: number;
  readonly proposalRetentionMs: number;
  readonly confirmationTtlMs: number;
  readonly oauthSessionTtlMs: number;
  readonly requestTimeoutMs: number;
  readonly publicBaseUrl: string | null;
  readonly providerBaseUrl: string;
}

const defaultAiLeaseSeconds = 180;
const defaultOauthSessionTtlMinutes = 10;
const defaultRequestTimeoutMs = 20_000;
const defaultProviderBaseUrl = "https://openrouter.ai";
const defaultAiRetentionDays = 30;
const defaultConfirmationTtlMinutes = 15;

/**
 * La modalità AI è **derivata** dalla configurazione presente, non da un flag
 * separato che potrebbe contraddirla.
 */
export function aiRuntimeConfig(config: AppConfig): AiRuntimeConfig {
  const provider = config.AI_PROVIDER;
  return {
    mode: provider ?? "disabled",
    model: config.AI_MODEL ?? "",
    leaseSeconds: config.AI_LEASE_SECONDS ?? defaultAiLeaseSeconds,
    maxCostMicros: config.AI_MAX_COST_MICROS ?? 5_000,
    dailyBudgetMicros: config.AI_DAILY_BUDGET_MICROS ?? 500_000,
    proposalRetentionMs:
      (config.AI_PROPOSAL_RETENTION_DAYS ?? defaultAiRetentionDays) *
      24 *
      60 *
      60 *
      1_000,
    confirmationTtlMs:
      (config.AI_CONFIRMATION_TTL_MINUTES ?? defaultConfirmationTtlMinutes) *
      60 *
      1_000,
    oauthSessionTtlMs:
      (config.AI_OAUTH_SESSION_TTL_MINUTES ?? defaultOauthSessionTtlMinutes) *
      60 *
      1_000,
    requestTimeoutMs: config.AI_REQUEST_TIMEOUT_MS ?? defaultRequestTimeoutMs,
    publicBaseUrl: config.AI_PUBLIC_BASE_URL ?? null,
    providerBaseUrl: config.AI_OPENROUTER_BASE_URL ?? defaultProviderBaseUrl,
  };
}
