const encoder = new TextEncoder();

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

export async function secretsEqual(
  provided: string | null,
  expected: string,
): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    sha256(provided ?? ""),
    sha256(expected),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

export async function keyedOpaqueId(
  key: string,
  value: string,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(value),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
