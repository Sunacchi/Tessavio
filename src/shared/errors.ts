export const errorCodes = [
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "DUPLICATE",
  "RATE_LIMITED",
  "CONCURRENCY_LIMITED",
  "RETRYABLE_EXTERNAL",
  "AMBIGUOUS_EXTERNAL",
  "PERMANENT_EXTERNAL",
  "INTERNAL_REDACTED",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, retryable: boolean) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function errorCodeOf(error: unknown): ErrorCode {
  return error instanceof AppError ? error.code : "INTERNAL_REDACTED";
}
