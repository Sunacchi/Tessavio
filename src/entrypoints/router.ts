import {
  callbackPath,
  completeAiLink,
  startPath,
  type LinkAiCredentialDependencies,
} from "../application/link-ai-credential";
import type { TelegramReplyPort } from "../application/ports/telegram";
import { D1IngressLimiter } from "../infrastructure/db/ingress-limiter";
import type { AppConfig } from "../shared/config";
import type { Clock } from "../shared/contracts";
import { logEvent } from "../shared/logger";
import { handleTelegramWebhook } from "./webhook";

/**
 * Router HTTP del Worker. Esiste perché la Phase C aggiunge una superficie
 * pubblica oltre al webhook: `/ai/oauth/start/:sessione` e
 * `/ai/oauth/callback/:sessione`.
 *
 * Regola di sicurezza: **le risposte di errore sono indistinguibili**. Una
 * sessione inesistente, scaduta o già usata producono la stessa pagina e lo
 * stesso stato, così il callback non diventa un oracolo.
 */
export interface AiRouterDependencies {
  readonly clock: Clock;
  readonly link: LinkAiCredentialDependencies;
  readonly reply: TelegramReplyPort;
  readonly publicBaseUrl: string | null;
}

const genericFailure =
  "Collegamento non riuscito. Torna su Telegram e riprova con /ai collega.";
const linkedPage =
  "Chiave collegata. Puoi tornare su Telegram: te lo confermo anche lì.";

function page(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function segmentAfter(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const segment = pathname.slice(prefix.length);
  return /^[A-Za-z0-9_-]{16,128}$/u.test(segment) ? segment : null;
}

export async function handleRequest(
  request: Request,
  env: Env,
  config: AppConfig,
  ai: AiRouterDependencies | null,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === config.WEBHOOK_PATH) {
    return handleTelegramWebhook(request, env, config);
  }
  if (ai === null || !url.pathname.startsWith("/ai/oauth/")) {
    return new Response(null, { status: 404 });
  }
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  }

  // Allowlist del redirect: il callback vale solo sull'host configurato.
  const baseUrl = ai.publicBaseUrl;
  if (baseUrl === null || new URL(baseUrl).host !== url.host) {
    return page(genericFailure, 400);
  }

  const limiter = new D1IngressLimiter(env.DB);
  const now = ai.clock.now();
  const window = Math.floor(
    now.getTime() / (config.WEBHOOK_RATE_WINDOW_SECONDS * 1_000),
  );
  const source = request.headers.get("cf-connecting-ip") ?? "unavailable";
  const allowed = await limiter.consumeRate(
    `ai-oauth:${source}:${String(window)}`,
    now,
    config.WEBHOOK_RATE_WINDOW_SECONDS,
    config.WEBHOOK_RATE_LIMIT_MAX,
  );
  if (!allowed) {
    logEvent("warn", "ai.oauth_rate_limited", { errorCode: "RATE_LIMITED" });
    return page(genericFailure, 429);
  }

  const startSession = segmentAfter(url.pathname, startPath(""));
  if (startSession !== null) {
    // `null` copre sessione inesistente, scaduta o già usata: stessa pagina.
    const challenge = await ai.link.sessions.challengeOf(startSession, now);
    if (challenge === null) return page(genericFailure, 400);
    const authorizeUrl = ai.link.authorization.authorizeUrl({
      callbackUrl: `${baseUrl}${callbackPath(startSession)}`,
      codeChallenge: challenge,
    });
    return new Response(null, {
      status: 302,
      headers: { location: authorizeUrl, "cache-control": "no-store" },
    });
  }

  const callbackSession = segmentAfter(url.pathname, callbackPath(""));
  if (callbackSession === null) return page(genericFailure, 400);
  const code = url.searchParams.get("code");
  if (code === null || code.length === 0 || code.length > 512) {
    return page(genericFailure, 400);
  }

  const completion = await completeAiLink(
    { sessionId: callbackSession, code },
    ai.link,
  );
  if (completion.outcome !== "linked") return page(genericFailure, 400);

  try {
    await ai.reply.send(
      completion.chatId,
      "Chiave OpenRouter collegata. Ora /ai proponi usa il tuo credito, con budget e privacy strict.",
    );
  } catch {
    logEvent("warn", "ai.link_notice_failed", {
      errorCode: "RETRYABLE_EXTERNAL",
    });
  }
  return page(linkedPage, 200);
}
