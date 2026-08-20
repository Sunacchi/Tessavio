import type { EventDayWindow } from "../domains/events/events";
import type { PreferenceProfile } from "../domains/preferences/preferences";
import type { UserScope } from "../shared/contracts";
import { AppError } from "../shared/errors";

export interface DayViewRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly window: EventDayWindow;
  readonly profile: PreferenceProfile;
  readonly limit: number;
}

export interface DayViewSection {
  readonly heading: string;
  readonly entries: readonly string[];
  readonly truncated: boolean;
}

/**
 * Una slice contribuisce alla vista di giornata (`/oggi`, `/domani`) senza che
 * chi la compone la nomini: autorizza da sé la propria lettura e restituisce
 * solo righe già formattate.
 */
export interface DayViewContributor {
  collect(request: DayViewRequest): Promise<DayViewSection>;
}

export const emptyDayViewSection = (heading: string): DayViewSection => ({
  heading,
  entries: [],
  truncated: false,
});

/**
 * Raccoglie i contributi in parallelo senza lasciare rifiuti non gestiti: la
 * prima autorizzazione negata diventa l'errore del comando.
 */
export async function collectDayView(
  contributors: readonly DayViewContributor[],
  request: DayViewRequest,
): Promise<readonly DayViewSection[]> {
  const settled = await Promise.allSettled(
    contributors.map((contributor) => contributor.collect(request)),
  );
  const sections: DayViewSection[] = [];
  let failure: unknown = null;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      sections.push(outcome.value);
    } else if (failure === null) {
      failure = outcome.reason;
    }
  }
  if (failure !== null) {
    throw failure instanceof Error
      ? failure
      : new AppError("INTERNAL_REDACTED", false);
  }
  return sections;
}
