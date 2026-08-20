import type { UserScope } from "../../shared/contracts";

export type DeliveryStatus =
  "pending" | "sending" | "sent" | "ambiguous" | "permanent_failure";

export interface DeliveryRepository {
  prepare(
    scope: UserScope,
    deliveryKey: string,
    jobId: string,
    now: Date,
  ): Promise<DeliveryStatus>;
  begin(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<"send" | "skip" | "ambiguous">;
  markSent(
    scope: UserScope,
    deliveryKey: string,
    remoteMessageId: string,
    now: Date,
  ): Promise<void>;
  markAmbiguous(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void>;
  markRetryableFailure(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void>;
  markPermanentFailure(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void>;
}
