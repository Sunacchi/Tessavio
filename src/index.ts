import { parseConfig, aiRuntimeConfig } from "./shared/config";
import { errorCodeOf } from "./shared/errors";
import { logEvent } from "./shared/logger";
import { handleInboundQueue } from "./entrypoints/queue";
import { handleRequest } from "./entrypoints/router";
import { runScheduledMaintenance } from "./entrypoints/scheduled";
import { buildAiLinkDependencies } from "./entrypoints/ai-runtime";
import { createSliceRepositories } from "./entrypoints/repositories";
import { SelfScopeAuthorizer } from "./security/authorization";
import { cryptoIdGenerator, systemClock } from "./shared/contracts";
import { GrammyTelegramReplyAdapter } from "./telegram/reply-adapter";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const config = parseConfig(env);
      const ai = aiRuntimeConfig(config);
      if (ai.mode === "disabled" || ai.publicBaseUrl === null) {
        // Superficie OAuth non esposta: senza AI o senza host pubblico il
        // Worker serve solo il webhook.
        return await handleRequest(request, env, config, null);
      }
      const link = await buildAiLinkDependencies({
        env,
        config,
        authorizer: new SelfScopeAuthorizer(),
        clock: systemClock,
        ids: cryptoIdGenerator,
        repositories: createSliceRepositories(env),
      });
      return await handleRequest(request, env, config, {
        clock: systemClock,
        link,
        publicBaseUrl: ai.publicBaseUrl,
        reply: new GrammyTelegramReplyAdapter(
          env.TELEGRAM_BOT_TOKEN,
          config.TELEGRAM_API_BASE_URL,
        ),
      });
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
