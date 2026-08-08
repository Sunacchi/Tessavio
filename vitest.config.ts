import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        d1Databases: ["UPGRADE_DB"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(projectDirectory, "migrations"),
          ),
          TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
          TELEGRAM_BOT_TOKEN: "test-bot-token",
        },
      },
    })),
  ],
  test: {
    coverage: { reporter: ["text", "json-summary"] },
    setupFiles: ["./tests/setup.ts"],
  },
});
