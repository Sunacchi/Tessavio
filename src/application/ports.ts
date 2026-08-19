import type { InboundMessageEnvelope } from "./queue-envelope";
import type { SendNotificationEnvelope } from "./queue-envelope";
import type {
  PreferenceProfile,
  PreferenceValues,
} from "../domains/preferences/preferences";
import type {
  EventDayWindow,
  EventRangeWindow,
  EventRecord,
  EventValues,
} from "../domains/events/events";
import type { UserScope } from "../shared/contracts";
import type {
  ReminderDayWindow,
  ReminderRecord,
  ReminderStatus,
} from "../domains/reminders/reminders";
import type {
  ReminderOccurrencePlan,
  ReminderRecurrenceRecord,
  ReminderRecurrenceValues,
} from "../domains/reminders/recurrence";
import type {
  TaskDayWindow,
  TaskRangeWindow,
  TaskRecord,
  TaskValues,
} from "../domains/tasks/tasks";
import type {
  PlannedShiftRecord,
  WorkBreakRecord,
  WorkBreakValues,
  WorkDayRecords,
  WorkIntervalValues,
  WorkLogRecord,
  WorkReport,
  WorkReportWindow,
  WorkRuleRecord,
  WorkRuleValues,
  WorkWindow,
} from "../domains/work/work";
import type {
  FinanceCurrencyTotal,
  FinanceDateRange,
  FinanceEntryRecord,
  FinanceEntryValues,
} from "../domains/finance/finance";
import type {
  ListEntityKind,
  ListItemRecord,
  ListItemValues,
  ListRecord,
  ListValues,
  ListWithItems,
  NoteRecord,
  NoteValues,
} from "../domains/lists/lists";

export interface RegisteredInbound {
  readonly duplicate: boolean;
  readonly envelope: InboundMessageEnvelope;
  readonly status: string;
}

export interface InboundRepository {
  register(
    envelope: InboundMessageEnvelope,
    now: Date,
  ): Promise<RegisteredInbound>;
  markEnqueued(jobId: string, now: Date): Promise<void>;
  claim(
    envelope: InboundMessageEnvelope,
    now: Date,
    leaseSeconds: number,
  ): Promise<"claimed" | "completed" | "busy" | "missing">;
  complete(jobId: string, now: Date, ambiguous: boolean): Promise<void>;
  fail(
    jobId: string,
    now: Date,
    errorCode: string,
    terminal: boolean,
  ): Promise<void>;
  listPendingEnqueue(
    before: Date,
    limit: number,
  ): Promise<InboundMessageEnvelope[]>;
}

export interface IdentityResolution {
  readonly userId: string;
  readonly created: boolean;
}

export interface IdentityRepository {
  resolveOrCreate(
    telegramUserId: string,
    candidateUserId: string,
    auditId: string,
    correlationId: string,
    now: Date,
  ): Promise<IdentityResolution>;
  getTelegramUserId(scope: UserScope): Promise<string | null>;
}

export type EffectStatus = "claimed" | "completed";

export interface EffectRepository {
  claim(
    scope: UserScope,
    effectKey: string,
    jobId: string,
    now: Date,
  ): Promise<boolean>;
  complete(scope: UserScope, effectKey: string, now: Date): Promise<void>;
  get(scope: UserScope, effectKey: string): Promise<EffectStatus | null>;
}

export type DeliveryStatus =
  "pending" | "sending" | "sent" | "ambiguous" | "permanent_failure";

export interface DeliveryRepository {
  prepare(
    scope: UserScope,
    deliveryKey: string,
    jobId: string,
    now: Date,
  ): Promise<DeliveryStatus>;
  begin(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<"send" | "skip" | "ambiguous">;
  markSent(
    scope: UserScope,
    deliveryKey: string,
    remoteMessageId: string,
    now: Date,
  ): Promise<void>;
  markAmbiguous(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void>;
  markRetryableFailure(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void>;
  markPermanentFailure(
    scope: UserScope,
    deliveryKey: string,
    now: Date,
  ): Promise<void>;
}

export interface TelegramReplyPort {
  send(
    chatId: number | string,
    text: string,
  ): Promise<{ readonly messageId: string }>;
  sendDocument?(
    chatId: number | string,
    document: {
      readonly fileName: string;
      readonly mimeType: "text/csv";
      readonly content: string;
      readonly caption: string;
    },
  ): Promise<{ readonly messageId: string }>;
}

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

export interface EventMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateEventResult =
  | {
      readonly outcome: "created" | "updated" | "cancelled" | "duplicate";
      readonly event: EventRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | { readonly outcome: "not_found" | "already_cancelled" };

export type UndoEventResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly event: EventRecord | null;
    }
  | {
      readonly outcome: "not_found" | "expired" | "used" | "stale";
    };

export interface EventRepository {
  get(scope: UserScope, eventId: string): Promise<EventRecord | null>;
  listForDay(
    scope: UserScope,
    window: EventDayWindow,
    limit?: number,
  ): Promise<EventRecord[]>;
  listForRange(
    scope: UserScope,
    window: EventRangeWindow,
    limit: number,
  ): Promise<EventRecord[]>;
  create(
    scope: UserScope,
    eventId: string,
    values: EventValues,
    context: EventMutationContext,
  ): Promise<MutateEventResult>;
  update(
    scope: UserScope,
    eventId: string,
    values: EventValues,
    context: EventMutationContext,
  ): Promise<MutateEventResult>;
  cancel(
    scope: UserScope,
    eventId: string,
    context: EventMutationContext,
  ): Promise<MutateEventResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<EventMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoEventResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}

export interface ReminderMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateReminderResult =
  | {
      readonly outcome: "created" | "cancelled" | "duplicate";
      readonly reminder: ReminderRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | { readonly outcome: "not_found" | "not_cancellable" };

export type UndoReminderResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly reminder: ReminderRecord | null;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface ClaimedReminder {
  readonly scope: UserScope;
  readonly envelope: SendNotificationEnvelope;
}

export interface ReminderRepository {
  get(scope: UserScope, reminderId: string): Promise<ReminderRecord | null>;
  listPending(scope: UserScope, limit: number): Promise<ReminderRecord[]>;
  listForDay(
    scope: UserScope,
    window: ReminderDayWindow,
    limit: number,
  ): Promise<ReminderRecord[]>;
  create(
    scope: UserScope,
    reminderId: string,
    values: {
      readonly text: string;
      readonly requestedAtUtc: Date;
      readonly originalTimeZone: string;
    },
    context: ReminderMutationContext,
  ): Promise<MutateReminderResult>;
  cancel(
    scope: UserScope,
    reminderId: string,
    context: ReminderMutationContext,
  ): Promise<MutateReminderResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<ReminderMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoReminderResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
  claimDue(
    now: Date,
    leaseSeconds: number,
    limit: number,
    newId: () => string,
  ): Promise<ClaimedReminder[]>;
  listRecoverableClaims(
    now: Date,
    enqueueRecoveryBefore: Date,
    limit: number,
  ): Promise<ClaimedReminder[]>;
  markEnqueued(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<void>;
  getForDelivery(
    scope: UserScope,
    reminderId: string,
    jobId: string,
  ): Promise<ReminderRecord | null>;
  deferForQuietHours(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    dueAt: Date,
    preferenceVersion: number,
    quietStartMinute: number,
    quietEndMinute: number,
    now: Date,
  ): Promise<boolean>;
  markSending(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    preferenceVersion: number,
    quietStartMinute: number | null,
    quietEndMinute: number | null,
    now: Date,
  ): Promise<boolean>;
  markDeliveryOutcome(
    scope: UserScope,
    reminderId: string,
    jobId: string,
    status: Extract<
      ReminderStatus,
      "claimed" | "sent" | "permanent_failure" | "ambiguous"
    >,
    now: Date,
    errorCode?: string,
  ): Promise<void>;
}

export type ReminderRecurrenceMutationContext = ReminderMutationContext;

export type MutateReminderRecurrenceResult =
  | {
      readonly outcome: "created" | "cancelled" | "duplicate";
      readonly recurrence: ReminderRecurrenceRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | {
      readonly outcome: "not_found" | "stale" | "not_cancellable";
    };

export type UndoReminderRecurrenceResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly recurrence: ReminderRecurrenceRecord | null;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface DueReminderRecurrenceCandidate {
  readonly scope: UserScope;
  readonly recurrenceId: string;
}

export interface MaterializeReminderOccurrenceContext {
  readonly occurrenceId: string;
  readonly generationKey: string;
  readonly auditId: string;
  readonly correlationId: string;
  readonly now: Date;
}

export interface ReminderRecurrenceRepository {
  get(
    scope: UserScope,
    recurrenceId: string,
  ): Promise<ReminderRecurrenceRecord | null>;
  listActive(
    scope: UserScope,
    limit: number,
  ): Promise<ReminderRecurrenceRecord[]>;
  create(
    scope: UserScope,
    recurrenceId: string,
    values: ReminderRecurrenceValues,
    context: ReminderRecurrenceMutationContext,
  ): Promise<MutateReminderRecurrenceResult>;
  cancel(
    scope: UserScope,
    recurrenceId: string,
    expectedVersion: number,
    context: ReminderRecurrenceMutationContext,
  ): Promise<MutateReminderRecurrenceResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<
      ReminderRecurrenceMutationContext,
      "undoToken" | "undoExpiresAt"
    >,
  ): Promise<UndoReminderRecurrenceResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
  listDueCandidates(
    now: Date,
    limit: number,
  ): Promise<DueReminderRecurrenceCandidate[]>;
  materializeOccurrence(
    scope: UserScope,
    recurrenceId: string,
    expectedVersion: number,
    plan: ReminderOccurrencePlan,
    context: MaterializeReminderOccurrenceContext,
  ): Promise<"generated" | "duplicate" | "stale">;
}

export type NotificationDeliveryStatus = DeliveryStatus;

export interface NotificationDeliveryRepository {
  prepare(
    scope: UserScope,
    dedupeKey: string,
    reminderId: string,
    jobId: string,
    now: Date,
  ): Promise<NotificationDeliveryStatus>;
  begin(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<"send" | "skip" | "ambiguous">;
  markSent(
    scope: UserScope,
    dedupeKey: string,
    remoteMessageId: string,
    now: Date,
  ): Promise<void>;
  markRetryableFailure(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<void>;
  markPermanentFailure(
    scope: UserScope,
    dedupeKey: string,
    now: Date,
  ): Promise<void>;
  markAmbiguous(scope: UserScope, dedupeKey: string, now: Date): Promise<void>;
  purgeTerminal(scope: UserScope, before: Date, limit: number): Promise<number>;
}

export interface TaskMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateTaskResult =
  | {
      readonly outcome: "created" | "completed" | "reopened" | "duplicate";
      readonly task: TaskRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | { readonly outcome: "not_found" | "already_completed" | "already_open" };

export type UndoTaskResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly task: TaskRecord | null;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface TaskRepository {
  get(scope: UserScope, taskId: string): Promise<TaskRecord | null>;
  listOpen(scope: UserScope, limit: number): Promise<TaskRecord[]>;
  listForDay(
    scope: UserScope,
    window: TaskDayWindow,
    limit?: number,
  ): Promise<TaskRecord[]>;
  listForRange(
    scope: UserScope,
    window: TaskRangeWindow,
    limit: number,
  ): Promise<TaskRecord[]>;
  create(
    scope: UserScope,
    taskId: string,
    values: TaskValues,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult>;
  complete(
    scope: UserScope,
    taskId: string,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult>;
  reopen(
    scope: UserScope,
    taskId: string,
    context: TaskMutationContext,
  ): Promise<MutateTaskResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<TaskMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoTaskResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}

export interface WorkMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type WorkEntityKind = "rule" | "shift" | "log" | "break";

export type MutateWorkResult<T> =
  | {
      readonly outcome: "created" | "duplicate";
      readonly entity: T;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | {
      readonly outcome:
        | "rule_not_found"
        | "work_log_not_found"
        | "outside_work_log"
        | "overlapping_break";
    };

export type UndoWorkResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly entityKind: WorkEntityKind;
      readonly entityId: string;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface WorkRepository {
  getRule(scope: UserScope, ruleId: string): Promise<WorkRuleRecord | null>;
  listRules(scope: UserScope, limit: number): Promise<WorkRuleRecord[]>;
  getShift(
    scope: UserScope,
    shiftId: string,
  ): Promise<PlannedShiftRecord | null>;
  getLog(scope: UserScope, workLogId: string): Promise<WorkLogRecord | null>;
  getBreak(
    scope: UserScope,
    workBreakId: string,
  ): Promise<WorkBreakRecord | null>;
  listForDay(scope: UserScope, window: WorkWindow): Promise<WorkDayRecords>;
  report(
    scope: UserScope,
    window: WorkReportWindow,
  ): Promise<WorkReport | null>;
  createRule(
    scope: UserScope,
    ruleId: string,
    values: WorkRuleValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkRuleRecord>>;
  createShift(
    scope: UserScope,
    shiftId: string,
    values: WorkIntervalValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<PlannedShiftRecord>>;
  createLog(
    scope: UserScope,
    workLogId: string,
    ruleId: string,
    values: WorkIntervalValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkLogRecord>>;
  createBreak(
    scope: UserScope,
    workBreakId: string,
    workLogId: string,
    values: WorkBreakValues,
    context: WorkMutationContext,
  ): Promise<MutateWorkResult<WorkBreakRecord>>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<WorkMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoWorkResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}

export interface FinanceMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateFinanceResult =
  | {
      readonly outcome: "created" | "updated" | "deleted" | "duplicate";
      readonly entry: FinanceEntryRecord;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | { readonly outcome: "not_found" | "stale" };

export type UndoFinanceResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly entry: FinanceEntryRecord | null;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface FinanceRepository {
  get(scope: UserScope, entryId: string): Promise<FinanceEntryRecord | null>;
  list(
    scope: UserScope,
    range: FinanceDateRange,
    limit: number,
  ): Promise<FinanceEntryRecord[]>;
  listForReport(
    scope: UserScope,
    range: FinanceDateRange,
    limit: number,
  ): Promise<FinanceEntryRecord[]>;
  totals(
    scope: UserScope,
    range: FinanceDateRange,
  ): Promise<FinanceCurrencyTotal[]>;
  create(
    scope: UserScope,
    entryId: string,
    values: FinanceEntryValues,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult>;
  update(
    scope: UserScope,
    entryId: string,
    expectedVersion: number,
    values: FinanceEntryValues,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult>;
  delete(
    scope: UserScope,
    entryId: string,
    expectedVersion: number,
    context: FinanceMutationContext,
  ): Promise<MutateFinanceResult>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<FinanceMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoFinanceResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}

export interface ListMutationContext {
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly auditId: string;
  readonly undoToken: string;
  readonly now: Date;
  readonly undoExpiresAt: Date;
}

export type MutateListEntityResult<T> =
  | {
      readonly outcome:
        | "created"
        | "updated"
        | "deleted"
        | "completed"
        | "reopened"
        | "duplicate";
      readonly entity: T;
      readonly undoToken: string | null;
      readonly undoExpiresAt: Date | null;
    }
  | {
      readonly outcome:
        | "not_found"
        | "stale"
        | "list_not_found"
        | "list_not_empty"
        | "already_completed"
        | "already_open";
    };

export type UndoListResult =
  | {
      readonly outcome: "reverted" | "duplicate";
      readonly entityKind: ListEntityKind;
      readonly entityId: string;
    }
  | { readonly outcome: "not_found" | "expired" | "used" | "stale" };

export interface ListRepository {
  getList(scope: UserScope, listId: string): Promise<ListWithItems | null>;
  listLists(scope: UserScope, limit: number): Promise<ListRecord[]>;
  listNotes(scope: UserScope, limit: number): Promise<NoteRecord[]>;
  getNote(scope: UserScope, noteId: string): Promise<NoteRecord | null>;
  createList(
    scope: UserScope,
    listId: string,
    values: ListValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>>;
  renameList(
    scope: UserScope,
    listId: string,
    expectedVersion: number,
    values: ListValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>>;
  deleteList(
    scope: UserScope,
    listId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListRecord>>;
  createItem(
    scope: UserScope,
    itemId: string,
    listId: string,
    values: ListItemValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>>;
  completeItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>>;
  reopenItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>>;
  deleteItem(
    scope: UserScope,
    itemId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<ListItemRecord>>;
  createNote(
    scope: UserScope,
    noteId: string,
    values: NoteValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>>;
  updateNote(
    scope: UserScope,
    noteId: string,
    expectedVersion: number,
    values: NoteValues,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>>;
  deleteNote(
    scope: UserScope,
    noteId: string,
    expectedVersion: number,
    context: ListMutationContext,
  ): Promise<MutateListEntityResult<NoteRecord>>;
  undo(
    scope: UserScope,
    token: string,
    context: Omit<ListMutationContext, "undoToken" | "undoExpiresAt">,
  ): Promise<UndoListResult>;
  purgeExpiredUndo(
    scope: UserScope,
    before: Date,
    limit: number,
  ): Promise<number>;
}
