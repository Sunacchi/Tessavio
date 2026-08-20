import { z } from "zod";

const telegramUserSchema = z
  .object({
    id: z.number().int().positive(),
    is_bot: z.boolean().optional(),
  })
  .loose();

const telegramChatSchema = z
  .object({
    id: z.number().int(),
    type: z.enum(["private", "group", "supergroup", "channel"]),
  })
  .loose();

const telegramMessageSchema = z
  .object({
    message_id: z.number().int().nonnegative(),
    date: z.number().int().nonnegative(),
    from: telegramUserSchema.optional(),
    chat: telegramChatSchema,
    text: z.string().max(4_096).optional(),
    // Solo la presenza dell'origine, mai chi ha inoltrato: serve a marcare la
    // provenance del testo, non a profilare terzi (ADR-0026).
    forward_origin: z.unknown().optional(),
    forward_date: z.number().int().nonnegative().optional(),
  })
  .loose();

export const telegramUpdateSchema = z
  .object({
    update_id: z.number().int().nonnegative(),
    message: telegramMessageSchema.optional(),
  })
  .loose();

const normalizedMessageSchema = z
  .object({
    messageId: z.number().int().nonnegative(),
    sentAtUnix: z.number().int().nonnegative(),
    sender: z
      .object({ id: z.number().int().positive(), isBot: z.boolean() })
      .strict(),
    chat: z
      .object({
        id: z.number().int(),
        type: z.enum(["private", "group", "supergroup", "channel"]),
      })
      .strict(),
    text: z.string().max(4_096).optional(),
    // Default per compatibilità: un envelope prodotto da un worker N-1 non
    // ha questo campo e deve restare processabile.
    forwarded: z.boolean().default(false),
  })
  .strict();

export const normalizedUpdateSchema = z
  .object({
    updateId: z.number().int().nonnegative(),
    message: normalizedMessageSchema.optional(),
  })
  .strict();

export type NormalizedTelegramUpdate = z.infer<typeof normalizedUpdateSchema>;

export function normalizeTelegramUpdate(
  update: z.infer<typeof telegramUpdateSchema>,
): NormalizedTelegramUpdate {
  const message = update.message;
  if (message?.from === undefined) {
    return { updateId: update.update_id };
  }

  return {
    updateId: update.update_id,
    message: {
      messageId: message.message_id,
      sentAtUnix: message.date,
      sender: { id: message.from.id, isBot: message.from.is_bot ?? false },
      chat: { id: message.chat.id, type: message.chat.type },
      // L'ordine delle chiavi segue lo schema: `envelope_json` viene
      // confrontato byte a byte al claim dell'inbox.
      ...(message.text === undefined ? {} : { text: message.text }),
      forwarded:
        message.forward_origin !== undefined ||
        message.forward_date !== undefined,
    },
  };
}
