import { AppError } from "../shared/errors";

export class PayloadTooLargeError extends AppError {
  constructor() {
    super("INVALID_INPUT", false);
    this.name = "PayloadTooLargeError";
  }
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new AppError("INVALID_INPUT", false);
    }
    if (parsedLength > maximumBytes) {
      throw new PayloadTooLargeError();
    }
  }

  if (request.body === null) {
    throw new AppError("INVALID_INPUT", false);
  }

  // Wrangler's generated Request body is ReadableStream<any>; Fetch guarantees byte chunks here.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const reader: ReadableStreamDefaultReader<Uint8Array> =
    request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      received += chunk.value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(chunk.value);
      chunk = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    throw new AppError("INVALID_INPUT", false);
  }
}
