import { Temporal } from "@js-temporal/polyfill";

/**
 * Finestra di lookup per risolvere un riferimento testuale a un'entità: il
 * codice cerca in un intervallo civile bounded del tenant, non nell'intero
 * storico. Tenere la finestra qui la rende verificabile e uguale per tutte le
 * slice che contribuiscono candidate.
 */
export interface CandidateWindow {
  readonly startDate: string;
  readonly endDate: string;
  readonly startAtUtc: Date;
  readonly endAtUtc: Date;
}

export const candidateWindowPastDays = 1;
export const candidateWindowFutureDays = 90;

export function candidateWindow(
  referenceInstant: Date,
  timeZone: string,
): CandidateWindow {
  const today = Temporal.Instant.fromEpochMilliseconds(
    referenceInstant.getTime(),
  )
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
  const start = today.subtract({ days: candidateWindowPastDays });
  const end = today.add({ days: candidateWindowFutureDays });
  return {
    startDate: start.toString(),
    endDate: end.toString(),
    startAtUtc: new Date(
      start.toZonedDateTime({ timeZone, plainTime: "00:00" }).epochMilliseconds,
    ),
    endAtUtc: new Date(
      end.add({ days: 1 }).toZonedDateTime({ timeZone, plainTime: "00:00" })
        .epochMilliseconds,
    ),
  };
}
