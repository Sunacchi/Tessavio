import { D1DeliveryRepository } from "../infrastructure/db/delivery-repository";
import { D1EffectRepository } from "../infrastructure/db/effect-repository";
import { D1EventRepository } from "../infrastructure/db/event-repository";
import { D1FinanceRepository } from "../infrastructure/db/finance-repository";
import { D1IdentityRepository } from "../infrastructure/db/identity-repository";
import { D1InboundRepository } from "../infrastructure/db/inbound-repository";
import { D1ListRepository } from "../infrastructure/db/list-repository";
import { D1PreferenceRepository } from "../infrastructure/db/preference-repository";
import { D1ReminderRecurrenceRepository } from "../infrastructure/db/reminder-recurrence-repository";
import { D1ReminderRepository } from "../infrastructure/db/reminder-repository";
import { D1TaskRepository } from "../infrastructure/db/task-repository";
import { D1WorkRepository } from "../infrastructure/db/work-repository";

export interface SliceRepositories {
  readonly deliveries: D1DeliveryRepository;
  readonly effects: D1EffectRepository;
  readonly events: D1EventRepository;
  readonly finance: D1FinanceRepository;
  readonly identities: D1IdentityRepository;
  readonly inbox: D1InboundRepository;
  readonly lists: D1ListRepository;
  readonly preferences: D1PreferenceRepository;
  readonly recurrences: D1ReminderRecurrenceRepository;
  readonly reminders: D1ReminderRepository;
  readonly tasks: D1TaskRepository;
  readonly work: D1WorkRepository;
}

/** Un'istanza per repository per invocazione: il binding D1 è condiviso. */
export function createSliceRepositories(env: Env): SliceRepositories {
  return {
    deliveries: new D1DeliveryRepository(env.DB),
    effects: new D1EffectRepository(env.DB),
    events: new D1EventRepository(env.DB),
    finance: new D1FinanceRepository(env.DB),
    identities: new D1IdentityRepository(env.DB),
    inbox: new D1InboundRepository(env.DB),
    lists: new D1ListRepository(env.DB),
    preferences: new D1PreferenceRepository(env.DB),
    recurrences: new D1ReminderRecurrenceRepository(env.DB),
    reminders: new D1ReminderRepository(env.DB),
    tasks: new D1TaskRepository(env.DB),
    work: new D1WorkRepository(env.DB),
  };
}
