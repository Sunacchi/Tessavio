import { eventCommandRoutes, type EventCommand } from "./commands/events";
import { financeCommandRoutes, type FinanceCommand } from "./commands/finance";
import { listsCommandRoutes, type ListsCommand } from "./commands/lists";
import { notesCommandRoutes, type NotesCommand } from "./commands/notes";
import {
  onboardingCommandRoutes,
  type OnboardingCommand,
} from "./commands/onboarding";
import {
  preferenceCommandRoutes,
  type PreferenceCommand,
} from "./commands/preferences";
import {
  reminderCommandRoutes,
  type ReminderCommand,
} from "./commands/reminders";
import { reportCommandRoutes, type ReportCommand } from "./commands/reports";
import { taskCommandRoutes, type TaskCommand } from "./commands/tasks";
import { undoCommandRoutes, type UndoCommand } from "./commands/undo";
import { workCommandRoutes, type WorkCommand } from "./commands/work";
import {
  commandParts,
  unsupported,
  type CommandRoute,
  type UnsupportedCommand,
} from "./commands/shared";

export type DeterministicCommand =
  | OnboardingCommand
  | PreferenceCommand
  | EventCommand
  | ReminderCommand
  | TaskCommand
  | WorkCommand
  | FinanceCommand
  | ListsCommand
  | NotesCommand
  | ReportCommand
  | UndoCommand
  | UnsupportedCommand;

const routes: readonly CommandRoute<DeterministicCommand>[] = [
  ...onboardingCommandRoutes,
  ...preferenceCommandRoutes,
  ...eventCommandRoutes,
  ...reminderCommandRoutes,
  ...taskCommandRoutes,
  ...workCommandRoutes,
  ...financeCommandRoutes,
  ...listsCommandRoutes,
  ...notesCommandRoutes,
  ...reportCommandRoutes,
  ...undoCommandRoutes,
];

const parsersByKeyword = new Map(routes);

/** Parole di comando registrate, esposte per il test di unicità del dispatch. */
export const registeredCommandKeywords: readonly string[] = routes.map(
  ([keyword]) => keyword,
);

export function parseDeterministicCommand(text: string): DeterministicCommand {
  const normalized = text.trim();
  const keyword = commandParts(normalized)[0]?.toLowerCase();
  const parse =
    keyword === undefined ? undefined : parsersByKeyword.get(keyword);
  return parse === undefined ? unsupported : parse(normalized);
}
