import type { AppConfig } from "../src/shared/config";
import type { Clock, IdGenerator } from "../src/shared/contracts";

export const testConfig: AppConfig = {
  APP_ENV: "development",
  TELEGRAM_API_BASE_URL: "https://api.telegram.org",
  WEBHOOK_PATH: "/telegram/webhook",
  WEBHOOK_MAX_BODY_BYTES: 65_536,
  WEBHOOK_RATE_LIMIT_MAX: 120,
  WEBHOOK_RATE_WINDOW_SECONDS: 60,
  WEBHOOK_MAX_CONCURRENCY: 16,
  WEBHOOK_LEASE_SECONDS: 30,
  INBOX_LEASE_SECONDS: 60,
  INBOX_RECOVERY_AFTER_SECONDS: 30,
};

export class FakeClock implements Clock {
  constructor(private current: Date = new Date("2026-08-08T08:00:00.000Z")) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export class SequenceIds implements IdGenerator {
  private next = 1;

  newId(): string {
    const suffix = String(this.next).padStart(12, "0");
    this.next += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  }
}

export function telegramStartUpdate(
  updateId = 101,
  telegramUserId = 2001,
): object {
  return {
    update_id: updateId,
    message: {
      message_id: 10,
      date: 1_786_173_600,
      from: {
        id: telegramUserId,
        is_bot: false,
        first_name: "Private fixture that must be discarded",
        username: "never_persist_this",
      },
      chat: { id: telegramUserId, type: "private" },
      text: "/start",
    },
  };
}

export function webhookRequest(
  body: object | string,
  secret = "test-webhook-secret",
  sourceIp = "192.0.2.10",
): Request {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://example.test/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": sourceIp,
      "x-telegram-bot-api-secret-token": secret,
    },
    body: payload,
  });
}
