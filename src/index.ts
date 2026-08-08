import { parseConfig } from "./shared/config";
import { errorCodeOf } from "./shared/errors";
import { logEvent } from "./shared/logger";
import { handleInboundQueue } from "./entrypoints/queue";
import { handleTelegramWebhook } from "./entrypoints/webhook";
import { runScheduledMaintenance } from "./entrypoints/scheduled";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleTelegramWebhook(request, env, parseConfig(env));
    } catch (error) {
      logEvent("error", "fetch.unhandled", { errorCode: errorCodeOf(error) });
      return new Response(null, { status: 500 });
    }
  },
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleInboundQueue(batch, env);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await runScheduledMaintenance(env, parseConfig(env));
  },
} satisfies ExportedHandler<Env>;
