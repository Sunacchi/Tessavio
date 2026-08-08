export type EventDraftCommand =
  | {
      readonly representation: "date_only";
      readonly localDate: string;
      readonly title: string;
    }
  | {
      readonly representation: "instant";
      readonly startLocal: string;
      readonly endLocal: string;
      readonly title: string;
    };

export type PreferenceCommand =
  | { readonly kind: "preferences.read" }
  | {
      readonly kind: "preferences.set";
      readonly language: string;
      readonly timeZone: string;
      readonly hourFormat: string;
      readonly defaultCurrency: string;
    }
  | { readonly kind: "preferences.undo"; readonly token: string }
  | {
      readonly kind: "preferences.quiet_hours.set";
      readonly start: string;
      readonly end: string;
    }
  | { readonly kind: "preferences.quiet_hours.disable" }
  | { readonly kind: "preferences.invalid" };

export type ReminderCommand =
  | {
      readonly kind: "reminders.create";
      readonly scheduledLocal: string;
      readonly text: string;
    }
  | { readonly kind: "reminders.read"; readonly reminderId: string }
  | { readonly kind: "reminders.list" }
  | { readonly kind: "reminders.cancel"; readonly reminderId: string }
  | { readonly kind: "reminders.invalid" };

export type TaskCommand =
  | {
      readonly kind: "tasks.create";
      readonly due: string;
      readonly priority: string;
      readonly title: string;
    }
  | { readonly kind: "tasks.read"; readonly taskId: string }
  | { readonly kind: "tasks.list" }
  | { readonly kind: "tasks.complete"; readonly taskId: string }
  | { readonly kind: "tasks.reopen"; readonly taskId: string }
  | { readonly kind: "tasks.invalid" };

export type EventCommand =
  | ({ readonly kind: "events.create" } & EventDraftCommand)
  | { readonly kind: "events.read"; readonly eventId: string }
  | ({
      readonly kind: "events.update";
      readonly eventId: string;
    } & EventDraftCommand)
  | { readonly kind: "events.cancel"; readonly eventId: string }
  | { readonly kind: "events.today" }
  | { readonly kind: "events.tomorrow" }
  | { readonly kind: "events.invalid" };

export type UndoCommand =
  | { readonly kind: "undo"; readonly token: string }
  | { readonly kind: "undo.invalid" };

export type DeterministicCommand =
  | { readonly kind: "start" }
  | PreferenceCommand
  | EventCommand
  | ReminderCommand
  | TaskCommand
  | UndoCommand
  | { readonly kind: "unsupported" };

const opaqueTokenPattern = /^[A-Za-z0-9_-]{16,128}$/u;
const entityIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

function parseEventCommand(text: string): EventCommand {
  const separatorIndex = text.indexOf("|");
  const commandText =
    separatorIndex === -1 ? text : text.slice(0, separatorIndex).trim();
  const title = separatorIndex === -1 ? null : text.slice(separatorIndex + 1);
  const parts = commandText.split(/\s+/u);
  const operation = parts[1]?.toLowerCase();

  if (
    separatorIndex === -1 &&
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "events.read", eventId: parts[2] ?? "" };
  }
  if (
    separatorIndex === -1 &&
    operation === "annulla" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "events.cancel", eventId: parts[2] ?? "" };
  }
  if (title === null) return { kind: "events.invalid" };

  const representation = parts[2]?.toLowerCase();
  if (operation === "crea" && representation === "data" && parts.length === 4) {
    return {
      kind: "events.create",
      representation: "date_only",
      localDate: parts[3] ?? "",
      title,
    };
  }
  if (operation === "crea" && representation === "ora" && parts.length === 5) {
    return {
      kind: "events.create",
      representation: "instant",
      startLocal: parts[3] ?? "",
      endLocal: parts[4] ?? "",
      title,
    };
  }
  if (
    operation === "modifica" &&
    entityIdPattern.test(parts[2] ?? "") &&
    parts[3]?.toLowerCase() === "data" &&
    parts.length === 5
  ) {
    return {
      kind: "events.update",
      eventId: parts[2] ?? "",
      representation: "date_only",
      localDate: parts[4] ?? "",
      title,
    };
  }
  if (
    operation === "modifica" &&
    entityIdPattern.test(parts[2] ?? "") &&
    parts[3]?.toLowerCase() === "ora" &&
    parts.length === 6
  ) {
    return {
      kind: "events.update",
      eventId: parts[2] ?? "",
      representation: "instant",
      startLocal: parts[4] ?? "",
      endLocal: parts[5] ?? "",
      title,
    };
  }
  return { kind: "events.invalid" };
}

function parseReminderCommand(text: string): ReminderCommand {
  const separatorIndex = text.indexOf("|");
  const commandText =
    separatorIndex === -1 ? text : text.slice(0, separatorIndex).trim();
  const reminderText =
    separatorIndex === -1 ? null : text.slice(separatorIndex + 1);
  const parts = commandText.split(/\s+/u);
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
  return { kind: "reminders.invalid" };
}

function parseTaskCommand(text: string): TaskCommand {
  const separators = Array.from(text.matchAll(/\|/gu));
  const firstSeparator = separators[0]?.index;
  const secondSeparator = separators[1]?.index;
  if (firstSeparator !== undefined && secondSeparator !== undefined) {
    const commandText = text.slice(0, firstSeparator).trim();
    const priority = text.slice(firstSeparator + 1, secondSeparator);
    const title = text.slice(secondSeparator + 1);
    const parts = commandText.split(/\s+/u);
    if (parts[1]?.toLowerCase() === "crea" && parts.length === 3) {
      return {
        kind: "tasks.create",
        due: parts[2] ?? "",
        priority,
        title,
      };
    }
  }
  if (separators.length > 0) return { kind: "tasks.invalid" };
  const parts = text.split(/\s+/u);
  const operation = parts[1]?.toLowerCase();
  if (operation === "lista" && parts.length === 2) {
    return { kind: "tasks.list" };
  }
  const taskId = parts[2] ?? "";
  if (parts.length !== 3 || !entityIdPattern.test(taskId)) {
    return { kind: "tasks.invalid" };
  }
  switch (operation) {
    case "leggi":
      return { kind: "tasks.read", taskId };
    case "completa":
      return { kind: "tasks.complete", taskId };
    case "riapri":
      return { kind: "tasks.reopen", taskId };
    default:
      return { kind: "tasks.invalid" };
  }
}

export function parseDeterministicCommand(text: string): DeterministicCommand {
  const normalized = text.trim();
  const parts = normalized.split(/\s+/u);
  const command = parts[0]?.toLowerCase();

  if (command === "/start" && parts.length === 1) {
    return { kind: "start" };
  }
  if (command === "/impostazioni") {
    if (parts.length === 1) {
      return { kind: "preferences.read" };
    }
    if (parts[1]?.toLowerCase() === "imposta" && parts.length === 6) {
      return {
        kind: "preferences.set",
        language: parts[2] ?? "",
        timeZone: parts[3] ?? "",
        hourFormat: parts[4] ?? "",
        defaultCurrency: parts[5] ?? "",
      };
    }
    if (parts[1]?.toLowerCase() === "quiete") {
      if (parts[2]?.toLowerCase() === "disattiva" && parts.length === 3) {
        return { kind: "preferences.quiet_hours.disable" };
      }
      if (parts.length === 4) {
        return {
          kind: "preferences.quiet_hours.set",
          start: parts[2] ?? "",
          end: parts[3] ?? "",
        };
      }
    }
    return { kind: "preferences.invalid" };
  }
  if (command === "/evento") {
    return parseEventCommand(normalized);
  }
  if (command === "/promemoria") {
    return parseReminderCommand(normalized);
  }
  if (command === "/task") {
    return parseTaskCommand(normalized);
  }
  if (command === "/oggi" && parts.length === 1) {
    return { kind: "events.today" };
  }
  if (command === "/domani" && parts.length === 1) {
    return { kind: "events.tomorrow" };
  }
  if (command === "/annulla") {
    const token = parts[1];
    if (
      parts.length === 2 &&
      token !== undefined &&
      opaqueTokenPattern.test(token)
    ) {
      return { kind: "undo", token };
    }
    return { kind: "undo.invalid" };
  }
  return { kind: "unsupported" };
}
