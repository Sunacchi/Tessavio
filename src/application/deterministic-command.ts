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

export type WorkCommand =
  | {
      readonly kind: "work.rule.create";
      readonly breakTreatment: string;
      readonly name: string;
    }
  | { readonly kind: "work.rule.read"; readonly ruleId: string }
  | { readonly kind: "work.rule.list" }
  | {
      readonly kind: "work.shift.create";
      readonly startLocal: string;
      readonly endLocal: string;
      readonly title: string;
    }
  | { readonly kind: "work.shift.read"; readonly shiftId: string }
  | {
      readonly kind: "work.log.create";
      readonly startLocal: string;
      readonly endLocal: string;
      readonly ruleId: string;
      readonly title: string;
    }
  | { readonly kind: "work.log.read"; readonly workLogId: string }
  | {
      readonly kind: "work.break.create";
      readonly workLogId: string;
      readonly startLocal: string;
      readonly endLocal: string;
    }
  | { readonly kind: "work.break.read"; readonly workBreakId: string }
  | { readonly kind: "work.day"; readonly localDate: string }
  | {
      readonly kind: "work.report";
      readonly startDate: string;
      readonly endDate: string;
    }
  | { readonly kind: "work.invalid" };

interface FinanceDraftCommand {
  readonly entryKind: string;
  readonly amountMinor: string;
  readonly currency: string;
  readonly localDate: string;
  readonly category: string;
  readonly merchant: string;
  readonly paymentMethod: string;
  readonly note: string;
}

export type FinanceCommand =
  | ({ readonly kind: "finance.create" } & FinanceDraftCommand)
  | ({
      readonly kind: "finance.update";
      readonly entryId: string;
      readonly expectedVersion: number;
    } & FinanceDraftCommand)
  | { readonly kind: "finance.read"; readonly entryId: string }
  | {
      readonly kind: "finance.list";
      readonly startDate: string;
      readonly endDate: string;
    }
  | {
      readonly kind: "finance.totals";
      readonly startDate: string;
      readonly endDate: string;
    }
  | {
      readonly kind: "finance.delete";
      readonly entryId: string;
      readonly expectedVersion: number;
    }
  | { readonly kind: "finance.invalid" };

export type ListsCommand =
  | { readonly kind: "lists.create"; readonly title: string }
  | { readonly kind: "lists.read"; readonly listId: string }
  | { readonly kind: "lists.list" }
  | {
      readonly kind: "lists.rename";
      readonly listId: string;
      readonly expectedVersion: number;
      readonly title: string;
    }
  | {
      readonly kind: "lists.delete";
      readonly listId: string;
      readonly expectedVersion: number;
    }
  | {
      readonly kind: "lists.item.create";
      readonly listId: string;
      readonly text: string;
    }
  | {
      readonly kind: "lists.item.complete";
      readonly itemId: string;
      readonly expectedVersion: number;
    }
  | {
      readonly kind: "lists.item.reopen";
      readonly itemId: string;
      readonly expectedVersion: number;
    }
  | {
      readonly kind: "lists.item.delete";
      readonly itemId: string;
      readonly expectedVersion: number;
    }
  | { readonly kind: "lists.invalid" };

export type NotesCommand =
  | {
      readonly kind: "notes.create";
      readonly title: string;
      readonly body: string;
    }
  | { readonly kind: "notes.read"; readonly noteId: string }
  | { readonly kind: "notes.list" }
  | {
      readonly kind: "notes.update";
      readonly noteId: string;
      readonly expectedVersion: number;
      readonly title: string;
      readonly body: string;
    }
  | {
      readonly kind: "notes.delete";
      readonly noteId: string;
      readonly expectedVersion: number;
    }
  | { readonly kind: "notes.invalid" };

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
  | WorkCommand
  | FinanceCommand
  | ListsCommand
  | NotesCommand
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

function parseWorkCommand(text: string): WorkCommand {
  const separatorIndex = text.indexOf("|");
  const commandText =
    separatorIndex === -1 ? text : text.slice(0, separatorIndex).trim();
  const label = separatorIndex === -1 ? null : text.slice(separatorIndex + 1);
  const parts = commandText.split(/\s+/u);
  const section = parts[1]?.toLowerCase();
  const operation = parts[2]?.toLowerCase();

  if (
    section === "regola" &&
    operation === "crea" &&
    parts.length === 4 &&
    label !== null
  ) {
    return {
      kind: "work.rule.create",
      breakTreatment:
        parts[3]?.toLowerCase() === "retribuita"
          ? "paid"
          : parts[3]?.toLowerCase() === "non_retribuita"
            ? "unpaid"
            : (parts[3] ?? ""),
      name: label,
    };
  }
  if (
    section === "regola" &&
    operation === "leggi" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return { kind: "work.rule.read", ruleId: parts[3] ?? "" };
  }
  if (section === "regole" && parts.length === 2 && label === null) {
    return { kind: "work.rule.list" };
  }
  if (
    section === "regola" &&
    operation === "lista" &&
    parts.length === 3 &&
    label === null
  ) {
    return { kind: "work.rule.list" };
  }
  if (
    section === "turno" &&
    operation === "crea" &&
    parts.length === 5 &&
    label !== null
  ) {
    return {
      kind: "work.shift.create",
      startLocal: parts[3] ?? "",
      endLocal: parts[4] ?? "",
      title: label,
    };
  }
  if (
    section === "turno" &&
    operation === "leggi" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return { kind: "work.shift.read", shiftId: parts[3] ?? "" };
  }
  if (
    section === "consuntivo" &&
    operation === "crea" &&
    parts.length === 6 &&
    entityIdPattern.test(parts[5] ?? "") &&
    label !== null
  ) {
    return {
      kind: "work.log.create",
      startLocal: parts[3] ?? "",
      endLocal: parts[4] ?? "",
      ruleId: parts[5] ?? "",
      title: label,
    };
  }
  if (
    section === "consuntivo" &&
    operation === "leggi" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return { kind: "work.log.read", workLogId: parts[3] ?? "" };
  }
  if (
    section === "pausa" &&
    operation === "crea" &&
    parts.length === 6 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return {
      kind: "work.break.create",
      workLogId: parts[3] ?? "",
      startLocal: parts[4] ?? "",
      endLocal: parts[5] ?? "",
    };
  }
  if (
    section === "pausa" &&
    operation === "leggi" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return { kind: "work.break.read", workBreakId: parts[3] ?? "" };
  }
  if (section === "giorno" && parts.length === 3 && label === null) {
    return { kind: "work.day", localDate: parts[2] ?? "" };
  }
  if (section === "report" && parts.length === 4 && label === null) {
    return {
      kind: "work.report",
      startDate: parts[2] ?? "",
      endDate: parts[3] ?? "",
    };
  }
  return { kind: "work.invalid" };
}

function parsePositiveVersion(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/u.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

function financeKind(value: string | undefined): string {
  switch (value?.toLowerCase()) {
    case "spesa":
      return "expense";
    case "entrata":
      return "income";
    default:
      return value ?? "";
  }
}

function parseFinanceFields(text: string): {
  readonly commandText: string;
  readonly fields: readonly [string, string, string, string];
} | null {
  const sections = text.split("|");
  if (sections.length < 2 || sections.length > 5) return null;
  const optional = sections.slice(1);
  return {
    commandText: sections[0]?.trim() ?? "",
    fields: [
      optional[0] ?? "",
      optional[1] ?? "",
      optional[2] ?? "",
      optional[3] ?? "",
    ],
  };
}

function parseFinanceCommand(text: string): FinanceCommand {
  const parsedFields = parseFinanceFields(text);
  if (parsedFields !== null) {
    const parts = parsedFields.commandText.split(/\s+/u);
    const operation = parts[1]?.toLowerCase();
    const [category, merchant, paymentMethod, note] = parsedFields.fields;
    if (operation === "crea" && parts.length === 6) {
      return {
        kind: "finance.create",
        entryKind: financeKind(parts[2]),
        amountMinor: parts[3] ?? "",
        currency: parts[4] ?? "",
        localDate: parts[5] ?? "",
        category,
        merchant,
        paymentMethod,
        note,
      };
    }
    const expectedVersion = parsePositiveVersion(parts[3]);
    if (
      operation === "correggi" &&
      parts.length === 8 &&
      entityIdPattern.test(parts[2] ?? "") &&
      expectedVersion !== null
    ) {
      return {
        kind: "finance.update",
        entryId: parts[2] ?? "",
        expectedVersion,
        entryKind: financeKind(parts[4]),
        amountMinor: parts[5] ?? "",
        currency: parts[6] ?? "",
        localDate: parts[7] ?? "",
        category,
        merchant,
        paymentMethod,
        note,
      };
    }
    return { kind: "finance.invalid" };
  }

  const parts = text.split(/\s+/u);
  const operation = parts[1]?.toLowerCase();
  if (
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "finance.read", entryId: parts[2] ?? "" };
  }
  if ((operation === "lista" || operation === "totali") && parts.length === 4) {
    return {
      kind: operation === "lista" ? "finance.list" : "finance.totals",
      startDate: parts[2] ?? "",
      endDate: parts[3] ?? "",
    };
  }
  const expectedVersion = parsePositiveVersion(parts[3]);
  if (
    operation === "elimina" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[2] ?? "") &&
    expectedVersion !== null
  ) {
    return {
      kind: "finance.delete",
      entryId: parts[2] ?? "",
      expectedVersion,
    };
  }
  return { kind: "finance.invalid" };
}

function parseListsCommand(text: string): ListsCommand {
  const sections = text.split("|");
  const commandText = sections[0]?.trim() ?? "";
  const parts = commandText.split(/\s+/u);
  const operation = parts[1]?.toLowerCase();

  if (sections.length === 2) {
    const content = sections[1] ?? "";
    if (operation === "crea" && parts.length === 2) {
      return { kind: "lists.create", title: content };
    }
    const expectedVersion = parsePositiveVersion(parts[3]);
    if (
      operation === "rinomina" &&
      parts.length === 4 &&
      entityIdPattern.test(parts[2] ?? "") &&
      expectedVersion !== null
    ) {
      return {
        kind: "lists.rename",
        listId: parts[2] ?? "",
        expectedVersion,
        title: content,
      };
    }
    if (
      operation === "aggiungi" &&
      parts.length === 3 &&
      entityIdPattern.test(parts[2] ?? "")
    ) {
      return {
        kind: "lists.item.create",
        listId: parts[2] ?? "",
        text: content,
      };
    }
    return { kind: "lists.invalid" };
  }
  if (sections.length !== 1) return { kind: "lists.invalid" };

  if (operation === "lista" && parts.length === 2) {
    return { kind: "lists.list" };
  }
  if (
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "lists.read", listId: parts[2] ?? "" };
  }
  const expectedVersion = parsePositiveVersion(parts[3]);
  if (
    parts.length === 4 &&
    entityIdPattern.test(parts[2] ?? "") &&
    expectedVersion !== null
  ) {
    if (operation === "elimina") {
      return {
        kind: "lists.delete",
        listId: parts[2] ?? "",
        expectedVersion,
      };
    }
    const itemKind =
      operation === "spunta"
        ? "lists.item.complete"
        : operation === "riapri"
          ? "lists.item.reopen"
          : operation === "rimuovi"
            ? "lists.item.delete"
            : null;
    if (itemKind !== null) {
      return {
        kind: itemKind,
        itemId: parts[2] ?? "",
        expectedVersion,
      };
    }
  }
  return { kind: "lists.invalid" };
}

function parseNotesCommand(text: string): NotesCommand {
  const sections = text.split("|");
  const commandText = sections[0]?.trim() ?? "";
  const parts = commandText.split(/\s+/u);
  const operation = parts[1]?.toLowerCase();

  if (sections.length === 3) {
    const title = sections[1] ?? "";
    const body = sections[2] ?? "";
    if (operation === "crea" && parts.length === 2) {
      return { kind: "notes.create", title, body };
    }
    const expectedVersion = parsePositiveVersion(parts[3]);
    if (
      operation === "modifica" &&
      parts.length === 4 &&
      entityIdPattern.test(parts[2] ?? "") &&
      expectedVersion !== null
    ) {
      return {
        kind: "notes.update",
        noteId: parts[2] ?? "",
        expectedVersion,
        title,
        body,
      };
    }
    return { kind: "notes.invalid" };
  }
  if (sections.length !== 1) return { kind: "notes.invalid" };
  if (operation === "lista" && parts.length === 2) {
    return { kind: "notes.list" };
  }
  if (
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "notes.read", noteId: parts[2] ?? "" };
  }
  const expectedVersion = parsePositiveVersion(parts[3]);
  if (
    operation === "elimina" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[2] ?? "") &&
    expectedVersion !== null
  ) {
    return {
      kind: "notes.delete",
      noteId: parts[2] ?? "",
      expectedVersion,
    };
  }
  return { kind: "notes.invalid" };
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
  if (command === "/lavoro") {
    return parseWorkCommand(normalized);
  }
  if (command === "/finanze" || command === "/spese") {
    return parseFinanceCommand(normalized);
  }
  if (command === "/liste") {
    return parseListsCommand(normalized);
  }
  if (command === "/note") {
    return parseNotesCommand(normalized);
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
