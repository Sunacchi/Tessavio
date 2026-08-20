import type { UserScope } from "../../shared/contracts";

export interface IdentityResolution {
  readonly userId: string;
  readonly created: boolean;
}

export interface IdentityRepository {
  resolveOrCreate(
    telegramUserId: string,
    candidateUserId: string,
    auditId: string,
    correlationId: string,
    now: Date,
  ): Promise<IdentityResolution>;
  getTelegramUserId(scope: UserScope): Promise<string | null>;
}
