import type {
  AiAuthorizationPort,
  AiCredentialRepository,
  AiKeyInspectionPort,
  AiOauthSessionRepository,
} from "./ports/ai-credentials";
import type { CommandContext } from "./handler-registry";
import {
  decryptCredential,
  encryptCredential,
  type KekRing,
} from "../security/credential-crypto";
import { createPkcePair } from "../security/pkce";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";
import { logEvent } from "../shared/logger";

export const credentialPurpose = "openrouter-api-key";

export interface LinkAiCredentialDependencies {
  readonly authorizer: Authorizer;
  readonly authorization: AiAuthorizationPort;
  readonly clock: Clock;
  readonly credentials: AiCredentialRepository;
  readonly ids: IdGenerator;
  readonly keyInspection: AiKeyInspectionPort;
  readonly kek: KekRing | null;
  readonly publicBaseUrl: string | null;
  readonly sessionTtlMs: number;
  readonly sessions: AiOauthSessionRepository;
}

const notConfigured = [
  "Collegamento non disponibile: manca la configurazione lato server.",
  "Servono un host pubblico HTTPS (AI_PUBLIC_BASE_URL) e la chiave di cifratura (AI_KEK).",
].join("\n");

export function startPath(sessionId: string): string {
  return `/ai/oauth/start/${sessionId}`;
}

export function callbackPath(sessionId: string): string {
  return `/ai/oauth/callback/${sessionId}`;
}

/** `/ai collega`: crea la sessione e restituisce il link, non la chiave. */
export async function startAiLink(
  context: CommandContext,
  dependencies: LinkAiCredentialDependencies,
): Promise<string> {
  await dependencies.authorizer.authorize({
    actorUserId: context.actorUserId,
    scope: context.scope,
    action: "ai:link",
  });
  const baseUrl = dependencies.publicBaseUrl;
  if (baseUrl === null || dependencies.kek === null) return notConfigured;

  const pkce = await createPkcePair();
  const sessionId = `ais_${dependencies.ids.newId()}`;
  const now = dependencies.clock.now();
  await dependencies.sessions.create(
    {
      sessionId,
      userId: context.scope.userId,
      chatId: String(context.chatId),
      codeVerifier: pkce.codeVerifier,
      codeChallenge: pkce.codeChallenge,
      correlationId: context.correlationId,
    },
    new Date(now.getTime() + dependencies.sessionTtlMs),
    now,
  );
  const minutes = Math.round(dependencies.sessionTtlMs / 60_000);
  return [
    "Apri questo link per collegare la tua chiave OpenRouter:",
    `${baseUrl}${startPath(sessionId)}`,
    `Vale una sola volta e scade fra ${String(minutes)} minuti.`,
    "La chiave resta sul server cifrata: non scriverla mai in chat.",
  ].join("\n");
}

export type LinkCompletion =
  | {
      readonly outcome: "linked";
      readonly userId: string;
      readonly chatId: string;
    }
  | { readonly outcome: "rejected" | "unavailable" };

/**
 * Callback OAuth. La sessione è il binding CSRF: viene consumata in modo
 * atomico prima dello scambio, così due callback concorrenti non producono due
 * chiavi.
 */
export async function completeAiLink(
  input: { readonly sessionId: string; readonly code: string },
  dependencies: LinkAiCredentialDependencies,
): Promise<LinkCompletion> {
  const kek = dependencies.kek;
  if (kek === null) return { outcome: "unavailable" };
  const now = dependencies.clock.now();
  const consumed = await dependencies.sessions.consume(input.sessionId, now);
  if (consumed.outcome !== "consumed") {
    logEvent("warn", "ai.oauth_session_rejected", {
      state: consumed.outcome,
      errorCode: "UNAUTHORIZED",
    });
    return { outcome: "rejected" };
  }

  const exchanged = await dependencies.authorization.exchange({
    code: input.code,
    codeVerifier: consumed.session.codeVerifier,
    correlationId: consumed.session.correlationId,
  });
  if (exchanged.outcome !== "linked") {
    return { outcome: exchanged.outcome };
  }

  const scope: UserScope = { userId: consumed.session.userId };
  const status = await dependencies.keyInspection.inspect({
    apiKey: exchanged.apiKey,
    correlationId: consumed.session.correlationId,
  });
  const record = await encryptCredential(
    kek,
    { userId: scope.userId, purpose: credentialPurpose },
    exchanged.apiKey,
  );
  await dependencies.credentials.save(
    scope,
    { record, label: status === null ? null : "openrouter" },
    dependencies.clock.now(),
  );
  logEvent("info", "ai.credential_linked", {
    correlationId: consumed.session.correlationId,
    userId: scope.userId,
  });
  return {
    outcome: "linked",
    userId: scope.userId,
    chatId: consumed.session.chatId,
  };
}

/** `/ai scollega`: cancella il ciphertext, non lo marca soltanto. */
export async function revokeAiCredential(
  context: CommandContext,
  dependencies: LinkAiCredentialDependencies,
): Promise<string> {
  await dependencies.authorizer.authorize({
    actorUserId: context.actorUserId,
    scope: context.scope,
    action: "ai:link",
  });
  const revoked = await dependencies.credentials.revoke(
    context.scope,
    dependencies.clock.now(),
  );
  return revoked
    ? "Chiave scollegata: il testo cifrato è stato cancellato e le proposte AI sono disattivate."
    : "Nessuna chiave collegata per questo utente.";
}

/** Restituisce la chiave in chiaro solo per la durata di una chiamata. */
export async function resolveApiKey(
  scope: UserScope,
  dependencies: {
    readonly credentials: AiCredentialRepository;
    readonly kek: KekRing | null;
  },
): Promise<string | null> {
  const kek = dependencies.kek;
  if (kek === null) return null;
  const stored = await dependencies.credentials.get(scope);
  if (stored === null) return null;
  const decrypted = await decryptCredential(
    kek,
    { userId: scope.userId, purpose: credentialPurpose },
    stored.record,
  );
  if (!decrypted.ok) {
    logEvent("error", "ai.credential_unreadable", {
      userId: scope.userId,
      state: decrypted.reason,
      errorCode: "INTERNAL_REDACTED",
    });
    return null;
  }
  return decrypted.value;
}
