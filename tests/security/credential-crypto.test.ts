import { describe, expect, it } from "vitest";
import {
  decryptCredential,
  encryptCredential,
  importKek,
  rotateCredential,
  type KekRing,
} from "../../src/security/credential-crypto";

const userA = { userId: "user-a", purpose: "openrouter-api-key" };
const userB = { userId: "user-b", purpose: "openrouter-api-key" };

function randomKekMaterial(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function ring(version = 1): Promise<KekRing> {
  return {
    current: await importKek(randomKekMaterial(), version),
    previous: [],
  };
}

describe("C2.2 envelope encryption delle credenziali", () => {
  it("cifra e decifra la credenziale dello stesso tenant", async () => {
    const keys = await ring();
    const record = await encryptCredential(keys, userA, "sk-or-v1-esempio");
    expect(record.ciphertext).not.toContain("sk-or-v1");
    await expect(decryptCredential(keys, userA, record)).resolves.toEqual({
      ok: true,
      value: "sk-or-v1-esempio",
    });
  });

  it("non decifra un ciphertext spostato su un altro tenant", async () => {
    const keys = await ring();
    const record = await encryptCredential(keys, userA, "sk-or-v1-esempio");
    await expect(decryptCredential(keys, userB, record)).resolves.toEqual({
      ok: false,
      reason: "authentication_failed",
    });
  });

  it("non decifra un ciphertext manomesso", async () => {
    const keys = await ring();
    const record = await encryptCredential(keys, userA, "sk-or-v1-esempio");
    const tampered = {
      ...record,
      ciphertext: `${record.ciphertext.slice(0, -4)}AAAA`,
    };
    await expect(decryptCredential(keys, userA, tampered)).resolves.toEqual({
      ok: false,
      reason: "authentication_failed",
    });
  });

  it("decifra una versione precedente della KEK e rifiuta una sconosciuta", async () => {
    const previous = await importKek(randomKekMaterial(), 1);
    const currentOnly: KekRing = {
      current: previous,
      previous: [],
    };
    const record = await encryptCredential(currentOnly, userA, "sk-vecchia");

    const rotated: KekRing = {
      current: await importKek(randomKekMaterial(), 2),
      previous: [previous],
    };
    await expect(decryptCredential(rotated, userA, record)).resolves.toEqual({
      ok: true,
      value: "sk-vecchia",
    });

    const withoutPrevious: KekRing = { current: rotated.current, previous: [] };
    await expect(
      decryptCredential(withoutPrevious, userA, record),
    ).resolves.toEqual({ ok: false, reason: "unknown_kek_version" });
  });

  it("rifiuta esplicitamente una versione di record sconosciuta", async () => {
    const keys = await ring();
    const record = await encryptCredential(keys, userA, "sk-or-v1-esempio");
    await expect(
      decryptCredential(keys, userA, { ...record, v: 99 }),
    ).resolves.toEqual({ ok: false, reason: "unknown_record_version" });
  });

  it("ri-avvolge verso la KEK corrente senza declassare", async () => {
    const first = await importKek(randomKekMaterial(), 1);
    const record = await encryptCredential(
      { current: first, previous: [] },
      userA,
      "sk-da-ruotare",
    );
    const rotatedRing: KekRing = {
      current: await importKek(randomKekMaterial(), 2),
      previous: [first],
    };
    const rewrapped = await rotateCredential(rotatedRing, userA, record);
    expect(rewrapped?.kekVersion).toBe(2);
    await expect(
      decryptCredential(rotatedRing, userA, rewrapped ?? record),
    ).resolves.toEqual({ ok: true, value: "sk-da-ruotare" });
    await expect(
      rotateCredential(rotatedRing, userA, rewrapped ?? record),
    ).resolves.toBeNull();
  });

  it("non riusa mai un nonce su generazioni ripetute", async () => {
    const keys = await ring();
    const nonces = new Set<string>();
    for (let index = 0; index < 64; index += 1) {
      const record = await encryptCredential(keys, userA, "sk-or-v1-esempio");
      nonces.add(record.nonce);
    }
    expect(nonces.size).toBe(64);
  });
});
