import {
  isOnboardingCommand,
  onboardingCommandKinds,
  type OnboardingCommand,
} from "./commands/onboarding";
import {
  commandRegistration,
  type CommandContext,
  type CommandRegistration,
} from "./handler-registry";
import type { EffectRepository } from "./ports/effects";
import { startOnboarding } from "../domains/onboarding/start";
import type { Authorizer } from "../security/authorization";
import type { Clock } from "../shared/contracts";

export interface ManageOnboardingDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly effects: EffectRepository;
}

export async function manageOnboarding(
  context: CommandContext,
  dependencies: ManageOnboardingDependencies,
): Promise<string> {
  await dependencies.authorizer.authorize({
    actorUserId: context.actorUserId,
    scope: context.scope,
    action: "onboarding:start",
  });

  const effectKey = `onboarding-start:${context.jobId}`;
  await dependencies.effects.claim(
    context.scope,
    effectKey,
    context.jobId,
    dependencies.clock.now(),
    "onboarding_start",
  );
  const reply = startOnboarding().text;
  await dependencies.effects.complete(
    context.scope,
    effectKey,
    dependencies.clock.now(),
  );
  return reply;
}

export function onboardingCommandRegistration(
  dependencies: ManageOnboardingDependencies,
): CommandRegistration {
  return commandRegistration<OnboardingCommand>(
    onboardingCommandKinds,
    isOnboardingCommand,
    (_command, context) => manageOnboarding(context, dependencies),
  );
}
