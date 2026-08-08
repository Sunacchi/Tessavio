import { describe, expect, it } from "vitest";
import { GrammyError, HttpError } from "grammy";
import { startOnboarding } from "../../src/domains/onboarding/start";
import { readBoundedJson } from "../../src/entrypoints/body";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { AppError } from "../../src/shared/errors";
import {
  normalizeTelegramUpdate,
  telegramUpdateSchema,
} from "../../src/telegram/schemas";
import { normalizeTelegramReplyError } from "../../src/telegram/reply-adapter";
import { telegramStartUpdate } from "../helpers";

describe("A1 deterministic boundaries", () => {
  it("normalizes only the minimum Telegram fields", () => {
    const parsed = telegramUpdateSchema.parse(telegramStartUpdate());
    const normalized = normalizeTelegramUpdate(parsed);

    expect(normalized).toEqual({
      updateId: 101,
      message: {
        messageId: 10,
        sentAtUnix: 1_786_173_600,
        sender: { id: 2001, isBot: false },
        chat: { id: 2001, type: "private" },
        text: "/start",
      },
    });
    expect(JSON.stringify(normalized)).not.toContain("never_persist_this");
  });

  it("denies cross-user authorization", async () => {
    const authorizer = new SelfScopeAuthorizer();
    await expect(
      authorizer.authorize({
        actorUserId: "user-a",
        scope: { userId: "user-b" },
        action: "onboarding:start",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<AppError>);
  });

  it("provides a deterministic no-AI welcome", () => {
    const result = startOnboarding();
    expect(result.text).toContain("funziona senza AI");
    expect(result.text).toContain("non inviare chiavi API");
  });

  it("rejects a chunked body beyond the configured maximum", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
        controller.enqueue(new Uint8Array(128));
        controller.close();
      },
    });
    const request = new Request("https://example.test", {
      method: "POST",
      body: stream,
    });
    await expect(readBoundedJson(request, 32)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    } satisfies Partial<AppError>);
  });

  it("classifies permanent Bot API rejections separately from temporary ones", () => {
    const permanent = normalizeTelegramReplyError(
      new GrammyError(
        "send failed",
        {
          ok: false,
          error_code: 403,
          description: "synthetic permanent rejection",
        },
        "sendMessage",
        {},
      ),
    );
    const rateLimited = normalizeTelegramReplyError(
      new GrammyError(
        "send failed",
        {
          ok: false,
          error_code: 429,
          description: "synthetic temporary rejection",
          parameters: { retry_after: 1 },
        },
        "sendMessage",
        {},
      ),
    );
    const serverFailure = normalizeTelegramReplyError(
      new GrammyError(
        "send failed",
        {
          ok: false,
          error_code: 503,
          description: "synthetic server rejection",
        },
        "sendMessage",
        {},
      ),
    );

    expect(permanent).toMatchObject({
      code: "PERMANENT_EXTERNAL",
      retryable: false,
    });
    expect(rateLimited).toMatchObject({
      code: "RETRYABLE_EXTERNAL",
      retryable: true,
    });
    expect(serverFailure).toMatchObject({
      code: "RETRYABLE_EXTERNAL",
      retryable: true,
    });
  });

  it("classifies a network failure as an ambiguous remote result", () => {
    const result = normalizeTelegramReplyError(
      new HttpError("synthetic network failure", new Error("redacted")),
    );

    expect(result).toMatchObject({
      code: "AMBIGUOUS_EXTERNAL",
      retryable: false,
    });
  });
});
