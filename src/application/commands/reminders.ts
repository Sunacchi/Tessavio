import {
  commandParts,
  entityIdPattern,
  parsePositiveVersion,
  type CommandRoute,
} from "./shared";

export type ReminderCommand =
  | {
      readonly kind: "reminders.create";
      readonly scheduledLocal: string;
      readonly text: string;
    }
  | { readonly kind: "reminders.read"; readonly reminderId: string }
  | { readonly kind: "reminders.list" }
  | { readonly kind: "reminders.cancel"; readonly reminderId: string }
  | {
      readonly kind: "reminders.recurrence.create";
      readonly frequency: "daily" | "weekly";
      readonly scheduledLocal: string;
      readonly text: string;
    }
  | {
      readonly kind: "reminders.recurrence.read";
      readonly recurrenceId: string;
    }
  | { readonly kind: "reminders.recurrence.list" }
  | {
      readonly kind: "reminders.recurrence.cancel";
      readonly recurrenceId: string;
      readonly expectedVersion: number;
    }
  | { readonly kind: "reminders.invalid" };

export function parseReminderCommand(text: string): ReminderCommand {
  const separatorIndex = text.indexOf("|");
  const commandText =
    separatorIndex === -1 ? text : text.slice(0, separatorIndex).trim();
  const reminderText =
    separatorIndex === -1 ? null : text.slice(separatorIndex + 1);
  const parts = commandParts(commandText);
  const operation = parts[1]?.toLowerCase();
  if (
    separatorIndex === -1 &&
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "reminders.read", reminderId: parts[2] ?? "" };
  }
  if (separatorIndex === -1 && operation === "lista" && parts.length === 2) {
    return { kind: "reminders.list" };
  }
  if (
    separatorIndex === -1 &&
    operation === "ricorrenza" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return {
      kind: "reminders.recurrence.read",
      recurrenceId: parts[2] ?? "",
    };
  }
  if (
    separatorIndex === -1 &&
    operation === "ricorrenze" &&
    parts.length === 2
  ) {
    return { kind: "reminders.recurrence.list" };
  }
  const expectedVersion = parsePositiveVersion(parts[3]);
  if (
    separatorIndex === -1 &&
    operation === "ferma" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[2] ?? "") &&
    expectedVersion !== null
  ) {
    return {
      kind: "reminders.recurrence.cancel",
      recurrenceId: parts[2] ?? "",
      expectedVersion,
    };
  }
  if (
    separatorIndex === -1 &&
    operation === "annulla" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "reminders.cancel", reminderId: parts[2] ?? "" };
  }
  if (operation === "crea" && parts.length === 3 && reminderText !== null) {
    return {
      kind: "reminders.create",
      scheduledLocal: parts[2] ?? "",
      text: reminderText,
    };
  }
  const frequency =
    parts[2]?.toLowerCase() === "giornaliero"
      ? "daily"
      : parts[2]?.toLowerCase() === "settimanale"
        ? "weekly"
        : null;
  if (
    operation === "ricorrente" &&
    parts.length === 4 &&
    frequency !== null &&
    reminderText !== null
  ) {
    return {
      kind: "reminders.recurrence.create",
      frequency,
      scheduledLocal: parts[3] ?? "",
      text: reminderText,
    };
  }
  return { kind: "reminders.invalid" };
}

export const reminderCommandRoutes: readonly CommandRoute<ReminderCommand>[] = [
  ["/promemoria", parseReminderCommand],
];
