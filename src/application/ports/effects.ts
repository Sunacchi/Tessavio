import type { UserScope } from "../../shared/contracts";

export type EffectStatus = "claimed" | "completed";

/** Tipi di effetto tracciati dal ledger: uno per famiglia di esecuzione. */
export type EffectKind = "onboarding_start" | "ai_execution";

export interface EffectRepository {
  claim(
    scope: UserScope,
    effectKey: string,
    jobId: string,
    now: Date,
    kind: EffectKind,
  ): Promise<boolean>;
  complete(scope: UserScope, effectKey: string, now: Date): Promise<void>;
  get(scope: UserScope, effectKey: string): Promise<EffectStatus | null>;
}
