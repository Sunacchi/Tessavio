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

export const queueEnvelopeSchema = z.discriminatedUnion("type", [
  inboundMessageEnvelopeSchema,
  sendNotificationEnvelopeSchema,
]);

export type QueueEnvelope = z.infer<typeof queueEnvelopeSchema>;
