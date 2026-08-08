import { Api, GrammyError, HttpError } from "grammy";
import type { TelegramReplyPort } from "../application/ports";
import { AppError } from "../shared/errors";

export class GrammyTelegramReplyAdapter implements TelegramReplyPort {
  private readonly api: Api;

  constructor(token: string, apiRoot: string) {
    this.api = new Api(token, { apiRoot });
  }

  async send(
    chatId: number,
    text: string,
  ): Promise<{ readonly messageId: string }> {
    try {
      const message = await this.api.sendMessage(chatId, text);
      return { messageId: String(message.message_id) };
    } catch (error) {
      if (error instanceof GrammyError) {
        const permanent =
          error.error_code >= 400 &&
          error.error_code < 500 &&
          error.error_code !== 429;
        throw new AppError(
          permanent ? "PERMANENT_EXTERNAL" : "RETRYABLE_EXTERNAL",
          !permanent,
        );
      }
      if (error instanceof HttpError) {
        throw new AppError("RETRYABLE_EXTERNAL", true);
      }
      throw new AppError("RETRYABLE_EXTERNAL", true);
    }
  }
}
