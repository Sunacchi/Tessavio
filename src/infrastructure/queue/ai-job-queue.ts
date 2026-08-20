import type { AiJobQueuePort } from "../../application/ports/ai";
import { aiProposalJobEnvelopeSchema } from "../../application/queue-envelope";
import { AppError } from "../../shared/errors";

/**
 * Pubblica il job AI sulla stessa coda dell'inbound con un tipo di envelope
 * diverso: il consumer lo riconosce e gli applica il proprio lease.
 */
export class QueueAiJobPublisher implements AiJobQueuePort {
  constructor(private readonly queue: Queue) {}

  async publish(payload: {
    readonly jobId: string;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly userId: string;
    readonly chatId: number | string;
    readonly messageText: string;
    readonly sentAtUnix: number;
    readonly createdAt: string;
  }): Promise<void> {
    const envelope = aiProposalJobEnvelopeSchema.safeParse({
      version: 1,
      type: "AI_PROPOSAL",
      jobId: payload.jobId,
      correlationId: payload.correlationId,
      idempotencyKey: payload.idempotencyKey,
      createdAt: payload.createdAt,
      attempt: 0,
      payload: {
        userId: payload.userId,
        chatId: payload.chatId,
        messageText: payload.messageText,
        sentAtUnix: payload.sentAtUnix,
      },
    });
    if (!envelope.success) throw new AppError("INVALID_INPUT", false);
    await this.queue.send(envelope.data, { contentType: "json" });
  }
}
