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
});

export type AppConfig = z.output<typeof configSchema>;

export function parseConfig(env: Env): AppConfig {
  return configSchema.parse(env);
}
