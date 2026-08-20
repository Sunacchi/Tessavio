import type { EncryptedCredential } from "../../security/credential-crypto";
import type { UserScope } from "../../shared/contracts";

/**
 * Sessione OAuth opaca. Non ha `scope` in `consume` di proposito: al callback
 * l'utente non è ancora noto, **è la sessione stessa il binding**. Il record
 * porta l'utente con sé.
 */
export interface OauthSessionRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly chatId: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly correlationId: string;
}

export type ConsumeOauthSessionResult =
  | { readonly outcome: "consumed"; readonly session: OauthSessionRecord }
  | { readonly outcome: "not_found" | "expired" | "used" };

export interface AiOauthSessionRepository {
  create(
    session: OauthSessionRecord,
    expiresAt: Date,
    now: Date,
  ): Promise<void>;
  /** Consumo atomico (CAS): due callback concorrenti non producono due chiavi. */
  consume(sessionId: string, now: Date): Promise<ConsumeOauthSessionResult>;
  /**
   * Challenge di una sessione ancora valida, senza consumarla: serve al
   * redirect di `/ai/oauth/start`. `null` copre inesistente, scaduta e usata:
   * il chiamante non deve poterle distinguere.
   */
  challengeOf(sessionId: string, now: Date): Promise<string | null>;
  purgeExpired(before: Date, limit: number): Promise<number>;
}

export interface StoredAiCredential {
  readonly record: EncryptedCredential;
  readonly label: string | null;
  readonly provider: "openrouter";
}

export interface AiCredentialRepository {
  save(
    scope: UserScope,
    credential: {
      readonly record: EncryptedCredential;
      readonly label: string | null;
    },
    now: Date,
  ): Promise<void>;
  get(scope: UserScope): Promise<StoredAiCredential | null>;
  /** La revoca cancella il ciphertext: non lo marca soltanto. */
  revoke(scope: UserScope, now: Date): Promise<boolean>;
}

export type BudgetReservation =
  | { readonly outcome: "reserved" }
  | { readonly outcome: "duplicate"; readonly status: string }
  | { readonly outcome: "exceeded"; readonly spentMicros: number };

export interface AiBudgetRepository {
  /**
   * Prenotazione atomica: un pre-check semplice non basta, due job concorrenti
   * lo supererebbero entrambi. La riga si inserisce solo se il totale del
   * giorno resta entro il tetto.
   */
  reserve(
    scope: UserScope,
    entryKey: string,
    localDate: string,
    reservedMicros: number,
    dailyLimitMicros: number,
    now: Date,
  ): Promise<BudgetReservation>;
  settle(
    scope: UserScope,
    entryKey: string,
    actualMicros: number,
    now: Date,
  ): Promise<void>;
  release(scope: UserScope, entryKey: string, now: Date): Promise<void>;
  spentMicros(scope: UserScope, localDate: string): Promise<number>;
  /** Recovery: una prenotazione senza consuntivo non blocca il budget per sempre. */
  releaseStale(before: Date, limit: number): Promise<number>;
}

export interface AiAuthorizationRequest {
  readonly callbackUrl: string;
  readonly codeChallenge: string;
}

export type AiAuthorizationExchange =
  | {
      readonly outcome: "linked";
      readonly apiKey: string;
      readonly label: string | null;
    }
  | { readonly outcome: "rejected" | "unavailable" };

/**
 * Porta provider-agnostica per il collegamento della credenziale: il dominio
 * non conosce OpenRouter.
 */
export interface AiAuthorizationPort {
  authorizeUrl(request: AiAuthorizationRequest): string;
  exchange(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly correlationId: string;
  }): Promise<AiAuthorizationExchange>;
}

export interface AiKeyStatus {
  readonly limitRemainingMicros: number | null;
  readonly isFreeTier: boolean;
}

export interface AiKeyInspectionPort {
  inspect(input: {
    readonly apiKey: string;
    readonly correlationId: string;
  }): Promise<AiKeyStatus | null>;
}
