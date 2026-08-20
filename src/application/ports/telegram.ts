export interface TelegramReplyPort {
  send(
    chatId: number | string,
    text: string,
  ): Promise<{ readonly messageId: string }>;
  sendDocument?(
    chatId: number | string,
    document: {
      readonly fileName: string;
      readonly mimeType: "text/csv";
      readonly content: string;
      readonly caption: string;
    },
  ): Promise<{ readonly messageId: string }>;
}
