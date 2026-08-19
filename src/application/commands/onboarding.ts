import {
  commandParts,
  unsupported,
  type CommandRoute,
  type UnsupportedCommand,
} from "./shared";

export interface OnboardingCommand {
  readonly kind: "start";
}

export function parseOnboardingCommand(
  text: string,
): OnboardingCommand | UnsupportedCommand {
  return commandParts(text).length === 1 ? { kind: "start" } : unsupported;
}

export const onboardingCommandRoutes: readonly CommandRoute<
  OnboardingCommand | UnsupportedCommand
>[] = [["/start", parseOnboardingCommand]];
