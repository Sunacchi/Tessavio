import { AppError } from "../shared/errors";

/**
 * Envelope encryption delle credenziali (ADR-0024).
 *
 * DEK AES-GCM 256 casuale per credenziale, nonce di 12 byte mai riusato, DEK
 * avvolta in AES-KW con la KEK del Worker. L'AAD lega il ciphertext al tenant,
 * allo scopo e alla versione della KEK: spostare un record da un utente a un
 * altro non decifra, fallisce.
 */
export const credentialRecordVersion = 1;

export interface EncryptedCredential {
  readonly v: number;
  readonly kekVersion: number;
  readonly nonce: string;
  readonly wrappedDek: string;
  readonly ciphertext: string;
}

export interface CredentialScope {
  readonly userId: string;
  readonly purpose: string;
}

export interface KekEntry {
  readonly version: number;
  readonly key: CryptoKey;
}

export interface KekRing {
  readonly current: KekEntry;
  /** Versioni precedenti: si decifra su N-1, non si cifra mai con esse. */
  readonly previous: readonly KekEntry[];
}

export type DecryptCredentialResult =
  | { readonly ok: true; readonly value: string }
  | {
      readonly ok: false;
      readonly reason:
        | "unknown_record_version"
        | "unknown_kek_version"
        | "authentication_failed";
    };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const nonceBytes = 12;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** La KEK arriva da un secret del Worker: 32 byte in base64. */
export async function importKek(
  rawBase64: string,
  version: number,
): Promise<KekEntry> {
  const raw = fromBase64(rawBase64);
  if (raw.byteLength !== 32) throw new AppError("INVALID_INPUT", false);
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-KW" },
    false,
    ["wrapKey", "unwrapKey"],
  );
  return { version, key };
}

function additionalData(
  scope: CredentialScope,
  recordVersion: number,
  kekVersion: number,
): Uint8Array {
  return encoder.encode(
    `${String(recordVersion)}|${scope.userId}|${scope.purpose}|${String(kekVersion)}`,
  );
}

export async function encryptCredential(
  ring: KekRing,
  scope: CredentialScope,
  plaintext: string,
): Promise<EncryptedCredential> {
  const generated = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  // Workers tipizza generateKey come CryptoKey | CryptoKeyPair: AES-GCM
  // produce sempre una chiave simmetrica, il confine è qui e solo qui.
  if (!("type" in generated)) throw new AppError("INTERNAL_REDACTED", false);
  const dek: CryptoKey = generated;
  const nonce = crypto.getRandomValues(new Uint8Array(nonceBytes));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce as BufferSource,
      additionalData: additionalData(
        scope,
        credentialRecordVersion,
        ring.current.version,
      ) as BufferSource,
    },
    dek,
    encoder.encode(plaintext),
  );
  const wrappedDek = await crypto.subtle.wrapKey("raw", dek, ring.current.key, {
    name: "AES-KW",
  });
  return {
    v: credentialRecordVersion,
    kekVersion: ring.current.version,
    nonce: toBase64(nonce),
    wrappedDek: toBase64(wrappedDek),
    ciphertext: toBase64(ciphertext),
  };
}

export async function decryptCredential(
  ring: KekRing,
  scope: CredentialScope,
  record: EncryptedCredential,
): Promise<DecryptCredentialResult> {
  if (record.v !== credentialRecordVersion) {
    return { ok: false, reason: "unknown_record_version" };
  }
  const kek = [ring.current, ...ring.previous].find(
    (entry) => entry.version === record.kekVersion,
  );
  if (kek === undefined) return { ok: false, reason: "unknown_kek_version" };

  try {
    const dek = await crypto.subtle.unwrapKey(
      "raw",
      fromBase64(record.wrappedDek),
      kek.key,
      { name: "AES-KW" },
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(record.nonce) as BufferSource,
        additionalData: additionalData(
          scope,
          record.v,
          record.kekVersion,
        ) as BufferSource,
      },
      dek,
      fromBase64(record.ciphertext),
    );
    return { ok: true, value: decoder.decode(plaintext) };
  } catch {
    return { ok: false, reason: "authentication_failed" };
  }
}

/**
 * Re-wrap progressivo verso la KEK corrente: il ciphertext non viene mai
 * declassato a una versione precedente.
 */
export async function rotateCredential(
  ring: KekRing,
  scope: CredentialScope,
  record: EncryptedCredential,
): Promise<EncryptedCredential | null> {
  if (record.kekVersion === ring.current.version) return null;
  const decrypted = await decryptCredential(ring, scope, record);
  if (!decrypted.ok) return null;
  return encryptCredential(ring, scope, decrypted.value);
}
