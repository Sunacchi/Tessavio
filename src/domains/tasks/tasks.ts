import { Temporal } from "@js-temporal/polyfill";

export const taskUndoTtlMs = 15 * 60 * 1_000;
export const taskTitleMaxLength = 200;

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "completed";

interface TaskRecordBase {
  readonly id: string;
  readonly title: string;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

export interface NoDueTaskRecord extends TaskRecordBase {
  readonly dueKind: "none";
}

export interface DateOnlyTaskRecord extends TaskRecordBase {
  readonly dueKind: "date_only";
  readonly dueDateLocal: string;
}

export interface InstantTaskRecord extends TaskRecordBase {
  readonly dueKind: "instant";
  readonly dueAtUtc: Date;
  readonly originalTimeZone: string;
}

export type TaskRecord =
  NoDueTaskRecord | DateOnlyTaskRecord | InstantTaskRecord;

export type TaskValues =
  | {
      readonly dueKind: "none";
      readonly title: string;
      readonly priority: TaskPriority;
    }
  | {
      readonly dueKind: "date_only";
      readonly title: string;
      readonly priority: TaskPriority;
      readonly dueDateLocal: string;
    }
  | {
      readonly dueKind: "instant";
      readonly title: string;
      readonly priority: TaskPriority;
      readonly dueAtUtc: Date;
      readonly originalTimeZone: string;
    };

export type TaskValidationIssue =
  | "title"
  | "priority"
  | "date"
  | "date_time"
  | "ambiguous_local_time"
  | "time_zone";

export type TaskValidationResult =
  | { readonly ok: true; readonly value: TaskValues }
  | { readonly ok: false; readonly issue: TaskValidationIssue };

export interface TaskDayWindow {
  readonly localDate: string;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
}

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

function validateTitle(value: string): string | null {
  const title = value.trim();
  const hasControlCharacter = Array.from(title).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  return title.length >= 1 &&
    title.length <= taskTitleMaxLength &&
    !hasControlCharacter
    ? title
    : null;
}

function parsePriority(value: string): TaskPriority | null {
  switch (value.trim().toLowerCase()) {
    case "bassa":
      return "low";
    case "media":
      return "medium";
    case "alta":
      return "high";
    default:
      return null;
  }
}

function parseLocalDate(value: string): Temporal.PlainDate | null {
  if (!localDatePattern.test(value)) return null;
  try {
    const parsed = Temporal.PlainDate.from(value, { overflow: "reject" });
    return parsed.toString() === value ? parsed : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function parseLocalDateTime(value: string): Temporal.PlainDateTime | null {
  if (!localDateTimePattern.test(value)) return null;
  try {
    return Temporal.PlainDateTime.from(value, { overflow: "reject" });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function resolveLocalInstant(
  value: Temporal.PlainDateTime,
  timeZone: string,
):
  | { readonly ok: true; readonly value: Temporal.Instant }
  | {
      readonly ok: false;
      readonly issue: "ambiguous_local_time" | "time_zone";
    } {
  try {
    return {
      ok: true,
      value: value
        .toZonedDateTime(timeZone, { disambiguation: "reject" })
        .toInstant(),
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    try {
      new Intl.DateTimeFormat("en", { timeZone }).format(0);
      return { ok: false, issue: "ambiguous_local_time" };
    } catch (timeZoneError) {
      if (timeZoneError instanceof RangeError) {
        return { ok: false, issue: "time_zone" };
      }
      throw timeZoneError;
    }
  }
}

export function validateTask(input: {
  readonly title: string;
  readonly priority: string;
  readonly due: string;
  readonly timeZone: string;
}): TaskValidationResult {
  const title = validateTitle(input.title);
  if (title === null) return { ok: false, issue: "title" };
  const priority = parsePriority(input.priority);
  if (priority === null) return { ok: false, issue: "priority" };
  const due = input.due.trim().toLowerCase();
  if (due === "nessuna") {
    return { ok: true, value: { dueKind: "none", title, priority } };
  }
  const date = parseLocalDate(input.due.trim());
  if (date !== null) {
    return {
      ok: true,
      value: {
        dueKind: "date_only",
        title,
        priority,
        dueDateLocal: date.toString(),
      },
    };
  }
  if (localDatePattern.test(input.due.trim())) {
    return { ok: false, issue: "date" };
  }
  const dateTime = parseLocalDateTime(input.due.trim());
  if (dateTime === null) return { ok: false, issue: "date_time" };
  const instant = resolveLocalInstant(dateTime, input.timeZone);
  if (!instant.ok) return instant;
  return {
    ok: true,
    value: {
      dueKind: "instant",
      title,
      priority,
      dueAtUtc: new Date(instant.value.epochMilliseconds),
      originalTimeZone: input.timeZone,
    },
  };
}
