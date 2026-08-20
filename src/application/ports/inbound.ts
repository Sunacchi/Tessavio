import type { InboundMessageEnvelope } from "../queue-envelope";

export interface RegisteredInbound {
  readonly duplicate: boolean;
  readonly envelope: InboundMessageEnvelope;
  readonly status: string;
}

export interface InboundRepository {
  register(
    envelope: InboundMessageEnvelope,
    now: Date,
  ): Promise<RegisteredInbound>;
  markEnqueued(jobId: string, now: Date): Promise<void>;
  claim(
    envelope: InboundMessageEnvelope,
    now: Date,
    leaseSeconds: number,
  ): Promise<"claimed" | "completed" | "busy" | "missing">;
  complete(jobId: string, now: Date, ambiguous: boolean): Promise<void>;
  fail(
    jobId: string,
    now: Date,
    errorCode: string,
    terminal: boolean,
  ): Promise<void>;
  listPendingEnqueue(
    before: Date,
    limit: number,
  ): Promise<InboundMessageEnvelope[]>;
}
