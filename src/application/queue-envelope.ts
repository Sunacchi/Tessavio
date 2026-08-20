import { z } from "zod";
import { normalizedUpdateSchema } from "../telegram/schemas";

export const inboundMessageEnvelopeSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("INBOUND_MESSAGE"),
    jobId: z.uuid(),
    correlationId: z.uuid(),
    idempotencyKey: z.string().min(1).max(128),
    createdAt: z.iso.datetime({ offset: true }),
    attempt: z.number().int().nonnegative(),
    payload: normalizedUpdateSchema,
  })
  .strict();

export type InboundMessageEnvelope = z.infer<
  typeof inboundMessageEnvelopeSchema
>;

export const sendNotificationEnvelopeSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("SEND_NOTIFICATION"),
    jobId: z.uuid(),
    correlationId: z.uuid(),
    idempotencyKey: z.string().min(1).max(128),
    createdAt: z.iso.datetime({ offset: true }),
    attempt: z.number().int().nonnegative(),
    payload: z
      .object({
        reminderId: z.string().min(1).max(128),
        userId: z.string().min(1).max(128),
      })
      .strict(),
  })
  .strict();

export type SendNotificationEnvelope = z.infer<
  typeof sendNotificationEnvelopeSchema
>;

/**
 * Envelope dedicato al lavoro AI: `INBOX_LEASE_SECONDS` vale 60 secondi e una
 * chiamata a un modello può superarli. Con un lease proprio il messaggio non
 * viene elaborato due volte mentre il modello risponde ancora.
 */
export const aiProposalJobEnvelopeSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("AI_PROPOSAL"),
    jobId: z.uuid(),
    correlationId: z.uuid(),
    idempotencyKey: z.string().min(1).max(128),
    createdAt: z.iso.datetime({ offset: true }),
    attempt: z.number().int().nonnegative(),
    payload: z
      .object({
        userId: z.string().min(1).max(128),
        chatId: z.union([z.number().int(), z.string().min(1).max(128)]),
        messageText: z.string().min(1).max(4_096),
        sentAtUnix: z.number().int().nonnegative(),
        forwarded: z.boolean().default(false),
        origin: z.enum(["command", "inbox"]).default("command"),
      })
      .strict(),
  })
  .strict();

export type AiProposalJobEnvelope = z.infer<typeof aiProposalJobEnvelopeSchema>;

export const queueEnvelopeSchema = z.discriminatedUnion("type", [
  inboundMessageEnvelopeSchema,
  sendNotificationEnvelopeSchema,
  aiProposalJobEnvelopeSchema,
]);

export type QueueEnvelope = z.infer<typeof queueEnvelopeSchema>;
