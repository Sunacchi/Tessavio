import { Api, GrammyError, HttpError, InputFile } from "grammy";
import type { TelegramReplyPort } from "../application/ports";
import { AppError } from "../shared/errors";

export function normalizeTelegramReplyError(error: unknown): AppError {
  if (error instanceof GrammyError) {
    const retryable = error.error_code === 429 || error.error_code >= 500;
    return new AppError(
      retryable ? "RETRYABLE_EXTERNAL" : "PERMANENT_EXTERNAL",
      retryable,
    );
  }
  if (error instanceof HttpError) {
    return new AppError("AMBIGUOUS_EXTERNAL", false);
  }
  return new AppError("AMBIGUOUS_EXTERNAL", false);
}

export class GrammyTelegramReplyAdapter implements TelegramReplyPort {
  private readonly api: Api;

  constructor(token: string, apiRoot: string) {
    this.api = new Api(token, { apiRoot });
  }

  async send(
    chatId: number | string,
    text: string,
  ): Promise<{ readonly messageId: string }> {
    try {
      const message = await this.api.sendMessage(chatId, text);
      return { messageId: String(message.message_id) };
    } catch (error) {
      throw normalizeTelegramReplyError(error);
    }
  }

  async sendDocument(
    chatId: number | string,
    document: {
      readonly fileName: string;
      readonly mimeType: "text/csv";
      readonly content: string;
      readonly caption: string;
    },
  ): Promise<{ readonly messageId: string }> {
    try {
      const bytes = new TextEncoder().encode(document.content);
      const message = await this.api.sendDocument(
        chatId,
        new InputFile(bytes, document.fileName),
        { caption: document.caption },
      );
      return { messageId: String(message.message_id) };
    } catch (error) {
      throw normalizeTelegramReplyError(error);
    }
  }
}
