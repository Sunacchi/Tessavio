import type { UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

export type Action =
  | "onboarding:start"
  | "preferences:read"
  | "preferences:write"
  | "preferences:undo"
  | "events:read"
  | "events:write"
  | "events:undo"
  | "reminders:read"
  | "reminders:write"
  | "reminders:undo"
  | "tasks:read"
  | "tasks:write"
  | "tasks:undo"
  | "work:read"
  | "work:write"
  | "work:undo"
  | "finance:read"
  | "finance:write"
  | "finance:undo"
  | "lists:read"
  | "lists:write"
  | "lists:undo";

export interface AuthorizationRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly action: Action;
}

export interface Authorizer {
  authorize(request: AuthorizationRequest): Promise<void>;
}

export class SelfScopeAuthorizer implements Authorizer {
  authorize(request: AuthorizationRequest): Promise<void> {
    if (request.actorUserId !== request.scope.userId) {
      return Promise.reject(new AppError("UNAUTHORIZED", false));
    }
    return Promise.resolve();
  }
}
