/**
 * PKCE S256. Il `code_verifier` resta **server-side**: non entra mai nell'URL
 * di autorizzazione né in un messaggio Telegram.
 */
const verifierBytes = 32;

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

export interface PkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}

export async function createPkcePair(): Promise<PkcePair> {
  const codeVerifier = toBase64Url(
    crypto.getRandomValues(new Uint8Array(verifierBytes)),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return { codeVerifier, codeChallenge: toBase64Url(digest) };
}

export async function codeChallengeOf(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return toBase64Url(digest);
}
