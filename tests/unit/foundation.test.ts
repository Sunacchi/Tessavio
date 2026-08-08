import { describe, expect, it } from "vitest";
import { startOnboarding } from "../../src/domains/onboarding/start";
import { readBoundedJson } from "../../src/entrypoints/body";
import { SelfScopeAuthorizer } from "../../src/security/authorization";
import { AppError } from "../../src/shared/errors";
import {
  normalizeTelegramUpdate,
  telegramUpdateSchema,
} from "../../src/telegram/schemas";
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
});
