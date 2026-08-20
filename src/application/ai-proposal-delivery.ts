import { parseProposalPlan, type ProposalPlan } from "./ai-plan";
import type { AiProposalRepository } from "./ports/ai";
import type { DeliveryRepository } from "./ports/delivery";
import type { TelegramReplyPort } from "./ports/telegram";
import type { AiProposalJobEnvelope } from "./queue-envelope";
import type { Clock, UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

interface AiProposalDeliveryDependencies {
  readonly clock: Clock;
  readonly deliveries: DeliveryRepository;
  readonly proposals: AiProposalRepository;
  readonly reply: TelegramReplyPort;
}

export interface AiProposalCompletion {
  readonly outcome: "completed" | "failed";
}

const invalidOutputReply = [
  "Non sono riuscito a interpretare la risposta del modello, quindi non ho scritto nulla.",
  "Puoi riprovare o usare un comando esplicito, per esempio /evento crea ora 2026-08-20T10:00 2026-08-20T11:00 | Titolo.",
].join("\n");

export async function storedPlan(
  dependencies: AiProposalDeliveryDependencies,
  scope: UserScope,
  envelope: AiProposalJobEnvelope,
): Promise<ProposalPlan | null> {
  const record = await dependencies.proposals.get(scope, envelope.jobId);
  return record?.planJson == null ? null : parseProposalPlan(record.planJson);
}

export async function failWith(
  dependencies: AiProposalDeliveryDependencies,
  scope: UserScope,
  envelope: AiProposalJobEnvelope,
  failureCode: string,
): Promise<AiProposalCompletion> {
  // Consegna prima di chiudere: un job chiuso non viene più ripreso, e una
  // consegna fallita in modo ritentabile lascerebbe l'utente senza esito.
  await deliver(dependencies, scope, envelope, invalidOutputReply);
  await dependencies.proposals.fail(
    scope,
    envelope.jobId,
    failureCode,
    dependencies.clock.now(),
  );
  return { outcome: "failed" };
}

export async function finish(
  dependencies: AiProposalDeliveryDependencies,
  scope: UserScope,
  envelope: AiProposalJobEnvelope,
  replyText: string,
  shouldDeliver = true,
): Promise<AiProposalCompletion> {
  if (shouldDeliver) {
    await deliver(dependencies, scope, envelope, replyText);
  }
  await dependencies.proposals.complete(
    scope,
    envelope.jobId,
    replyText,
    dependencies.clock.now(),
  );
  return { outcome: "completed" };
}

/** Consegna con lo stesso ledger delle risposte deterministiche. */
async function deliver(
  dependencies: AiProposalDeliveryDependencies,
  scope: UserScope,
  envelope: AiProposalJobEnvelope,
  replyText: string,
): Promise<void> {
  const deliveryKey = `telegram-reply:ai:${envelope.jobId}`;
  await dependencies.deliveries.prepare(
    scope,
    deliveryKey,
    envelope.jobId,
    dependencies.clock.now(),
  );
  const action = await dependencies.deliveries.begin(
    scope,
    deliveryKey,
    dependencies.clock.now(),
  );
  if (action !== "send") return;
  try {
    const sent = await dependencies.reply.send(
      envelope.payload.chatId,
      replyText,
    );
    await dependencies.deliveries.markSent(
      scope,
      deliveryKey,
      sent.messageId,
      dependencies.clock.now(),
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "RETRYABLE_EXTERNAL") {
      await dependencies.deliveries.markRetryableFailure(
        scope,
        deliveryKey,
        dependencies.clock.now(),
      );
      throw error;
    }
    if (error instanceof AppError && error.code === "PERMANENT_EXTERNAL") {
      await dependencies.deliveries.markPermanentFailure(
        scope,
        deliveryKey,
        dependencies.clock.now(),
      );
      return;
    }
    await dependencies.deliveries.markAmbiguous(
      scope,
      deliveryKey,
      dependencies.clock.now(),
    );
  }
}
