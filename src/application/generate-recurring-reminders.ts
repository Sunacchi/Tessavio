import type { ReminderRecurrenceRepository } from "./ports";
import { planReminderOccurrence } from "../domains/reminders/recurrence";
import type { Clock, IdGenerator } from "../shared/contracts";

export interface GenerateRecurringRemindersDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly recurrences: ReminderRecurrenceRepository;
}

export async function generateRecurringReminders(
  dependencies: GenerateRecurringRemindersDependencies,
  limit: number,
): Promise<number> {
  const now = dependencies.clock.now();
  const candidates = await dependencies.recurrences.listDueCandidates(
    now,
    limit,
  );
  let generated = 0;
  for (const candidate of candidates) {
    const recurrence = await dependencies.recurrences.get(
      candidate.scope,
      candidate.recurrenceId,
    );
    if (
      recurrence?.status !== "active" ||
      recurrence.nextDueAtUtc.getTime() > now.getTime()
    ) {
      continue;
    }
    const plan = planReminderOccurrence(recurrence, now);
    const outcome = await dependencies.recurrences.materializeOccurrence(
      candidate.scope,
      recurrence.id,
      recurrence.version,
      plan,
      {
        occurrenceId: dependencies.ids.newId(),
        generationKey: dependencies.ids.newId(),
        auditId: dependencies.ids.newId(),
        correlationId: dependencies.ids.newId(),
        now,
      },
    );
    if (outcome === "generated") generated += 1;
  }
  return generated;
}
