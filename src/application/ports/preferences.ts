import type {
  PreferenceProfile,
  PreferenceValues,
} from "../../domains/preferences/preferences";
import type { UserScope } from "../../shared/contracts";

export interface PreferenceMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export interface SetPreferencesResult {
  readonly outcome: "created" | "updated" | "duplicate";
  readonly profile: PreferenceProfile;
  readonly undoToken: string | null;
  readonly undoExpiresAt: Date | null;
}

export type UndoPreferencesResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly profile: PreferenceProfile | null;
    }
  | {
      readonly outcome: "not_found" | "expired" | "used" | "stale";
    };

export interface PreferenceRepository {
  get(scope: UserScope): Promise<PreferenceProfile | null>;
  set(
    scope: UserScope,
    values: PreferenceValues,
    context: PreferenceMutationContext,
  ): Promise<SetPreferencesResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<PreferenceMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoPreferencesResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}
