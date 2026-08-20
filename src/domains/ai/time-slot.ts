import { Temporal } from "@js-temporal/polyfill";

/**
 * Risoluzione deterministica del testo temporale prodotto dal modello.
 * Il modello scrive `"domani alle 15"`; qui, e solo qui, quel testo diventa una
 * data locale con timezone IANA dell'utente. Invariante 7: nessun offset fisso,
 * nessun DST calcolato a mano — decide Temporal.
 */
export type ResolvedTimeSlot =
  | {
      readonly kind: "date_only";
      readonly localDate: string;
      readonly assumed: boolean;
      readonly assumptions: readonly string[];
    }
  | {
      readonly kind: "instant";
      readonly localDateTime: string;
      readonly assumed: boolean;
      readonly assumptions: readonly string[];
    };

export type TimeSlotIssue =
  "unparsable" | "ambiguous_local_time" | "time_zone" | "out_of_range";

export type TimeSlotResult =
  | { readonly ok: true; readonly value: ResolvedTimeSlot }
  | { readonly ok: false; readonly issue: TimeSlotIssue };

/** Finestra di plausibilità: un giorno indietro, due anni avanti. */
const pastToleranceMs = 24 * 60 * 60 * 1_000;
const futureHorizonMs = 2 * 365 * 24 * 60 * 60 * 1_000;

const weekdays: Readonly<Record<string, number>> = {
  lunedi: 1,
  martedi: 2,
  mercoledi: 3,
  giovedi: 4,
  venerdi: 5,
  sabato: 6,
  domenica: 7,
};

const months: Readonly<Record<string, number>> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

const dayParts: Readonly<Record<string, number>> = {
  mattina: 9 * 60,
  mattino: 9 * 60,
  stamattina: 9 * 60,
  mezzogiorno: 12 * 60,
  pomeriggio: 15 * 60,
  sera: 20 * 60,
  stasera: 20 * 60,
  serata: 20 * 60,
  notte: 22 * 60,
  mezzanotte: 0,
};

function normalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface TimeOfDay {
  readonly minutes: number;
  readonly assumed: boolean;
  readonly assumption: string | null;
}

function extractTime(text: string): TimeOfDay | null {
  const explicit =
    /(?:\balle\b|\bore\b|\bh\b)?\s*(\d{1,2})[:.](\d{2})\b/u.exec(text) ??
    /(?:\balle\b|\bore\b)\s*(\d{1,2})\b/u.exec(text);
  if (explicit !== null) {
    const hour = Number(explicit[1]);
    const minute = explicit[2] === undefined ? 0 : Number(explicit[2]);
    if (hour > 23 || minute > 59) return null;
    return { minutes: hour * 60 + minute, assumed: false, assumption: null };
  }
  for (const [word, minutes] of Object.entries(dayParts)) {
    if (new RegExp(`\\b${word}\\b`, "u").test(text)) {
      return {
        minutes,
        assumed: true,
        assumption: `"${word}" interpretato come le ${pad(Math.trunc(minutes / 60))}:${pad(minutes % 60)}`,
      };
    }
  }
  return null;
}

interface DatePart {
  readonly date: Temporal.PlainDate;
  readonly assumed: boolean;
  readonly assumption: string | null;
}

function extractDate(
  text: string,
  today: Temporal.PlainDate,
): DatePart | null | "invalid" {
  const iso = /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/u.exec(text);
  if (iso !== null) {
    try {
      return {
        date: Temporal.PlainDate.from({
          year: Number(iso[1]),
          month: Number(iso[2]),
          day: Number(iso[3]),
        }),
        assumed: false,
        assumption: null,
      };
    } catch (error) {
      if (error instanceof RangeError) return "invalid";
      throw error;
    }
  }
  if (/\bdopodomani\b/u.test(text)) {
    return { date: today.add({ days: 2 }), assumed: false, assumption: null };
  }
  if (/\bdomani\b/u.test(text)) {
    return { date: today.add({ days: 1 }), assumed: false, assumption: null };
  }
  if (/\boggi\b|\bstasera\b|\bstamattina\b/u.test(text)) {
    return { date: today, assumed: false, assumption: null };
  }
  const numericMonth = /\b(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?\b/u.exec(text);
  if (numericMonth !== null) {
    const month = months[numericMonth[2] ?? ""];
    if (month !== undefined) {
      const year =
        numericMonth[3] === undefined ? today.year : Number(numericMonth[3]);
      try {
        const candidate = Temporal.PlainDate.from({
          year,
          month,
          day: Number(numericMonth[1]),
        });
        const rolled =
          numericMonth[3] === undefined &&
          Temporal.PlainDate.compare(candidate, today) < 0
            ? candidate.add({ years: 1 })
            : candidate;
        return {
          date: rolled,
          assumed: rolled.year !== candidate.year,
          assumption:
            rolled.year === candidate.year
              ? null
              : `anno assunto: ${String(rolled.year)}`,
        };
      } catch (error) {
        if (error instanceof RangeError) return "invalid";
        throw error;
      }
    }
  }
  for (const [word, isoDayOfWeek] of Object.entries(weekdays)) {
    if (new RegExp(`\\b${word}\\b`, "u").test(text)) {
      const delta = (isoDayOfWeek - today.dayOfWeek + 7) % 7;
      const date = today.add({ days: delta === 0 ? 7 : delta });
      return {
        date,
        assumed: true,
        assumption: `"${word}" interpretato come ${date.toString()}`,
      };
    }
  }
  return null;
}

function relativeOffset(
  text: string,
  reference: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime | null {
  const match = /\b(?:fra|tra)\s+(\d{1,3})\s+(minuti?|ore|giorni?)\b/u.exec(
    text,
  );
  if (match === null) return null;
  const amount = Number(match[1]);
  const unit = match[2] ?? "";
  if (unit.startsWith("minut")) return reference.add({ minutes: amount });
  if (unit.startsWith("or")) return reference.add({ hours: amount });
  return reference.add({ days: amount });
}

export function resolveTimeSlot(
  rawText: string,
  context: {
    readonly timeZone: string;
    readonly referenceInstant: Date;
  },
): TimeSlotResult {
  const text = normalize(rawText);
  if (text.length === 0) return { ok: false, issue: "unparsable" };

  let reference: Temporal.ZonedDateTime;
  try {
    reference = Temporal.Instant.fromEpochMilliseconds(
      context.referenceInstant.getTime(),
    ).toZonedDateTimeISO(context.timeZone);
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, issue: "time_zone" };
    throw error;
  }
  const today = reference.toPlainDate();

  const relative = relativeOffset(text, reference);
  if (relative !== null) {
    return withinRange(
      {
        kind: "instant",
        localDateTime: `${relative.toPlainDate().toString()}T${pad(relative.hour)}:${pad(relative.minute)}`,
        assumed: false,
        assumptions: [],
      },
      context,
    );
  }

  const datePart = extractDate(text, today);
  if (datePart === "invalid") return { ok: false, issue: "unparsable" };
  const timePart = extractTime(text);
  if (datePart === null && timePart === null) {
    return { ok: false, issue: "unparsable" };
  }

  const assumptions: string[] = [];
  if (datePart?.assumption != null) assumptions.push(datePart.assumption);
  if (timePart?.assumption != null) assumptions.push(timePart.assumption);

  if (timePart === null && datePart !== null) {
    return withinRange(
      {
        kind: "date_only",
        localDate: datePart.date.toString(),
        assumed: datePart.assumed,
        assumptions,
      },
      context,
    );
  }
  if (timePart === null) return { ok: false, issue: "unparsable" };

  let date = datePart?.date ?? today;
  let assumed = (datePart?.assumed ?? false) || timePart.assumed;
  if (datePart === null) {
    const todayAtTime = date
      .toPlainDateTime({
        hour: Math.trunc(timePart.minutes / 60),
        minute: timePart.minutes % 60,
      })
      .toString({ smallestUnit: "minute" });
    if (isBeforeReference(todayAtTime, context, reference)) {
      date = date.add({ days: 1 });
      assumptions.push(`data assunta: ${date.toString()}`);
      assumed = true;
    }
  }

  const localDateTime = `${date.toString()}T${pad(Math.trunc(timePart.minutes / 60))}:${pad(timePart.minutes % 60)}`;
  const guard = validateLocalInstant(localDateTime, context.timeZone);
  if (guard !== null) return { ok: false, issue: guard };
  return withinRange(
    { kind: "instant", localDateTime, assumed, assumptions },
    context,
  );
}

function isBeforeReference(
  localDateTime: string,
  context: { readonly timeZone: string },
  reference: Temporal.ZonedDateTime,
): boolean {
  try {
    const candidate = Temporal.PlainDateTime.from(
      localDateTime,
    ).toZonedDateTime(context.timeZone, { disambiguation: "compatible" });
    return Temporal.ZonedDateTime.compare(candidate, reference) <= 0;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function validateLocalInstant(
  localDateTime: string,
  timeZone: string,
): TimeSlotIssue | null {
  try {
    Temporal.PlainDateTime.from(localDateTime).toZonedDateTime(timeZone, {
      disambiguation: "reject",
    });
    return null;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    try {
      new Intl.DateTimeFormat("en", { timeZone }).format(0);
      return "ambiguous_local_time";
    } catch (timeZoneError) {
      if (timeZoneError instanceof RangeError) return "time_zone";
      throw timeZoneError;
    }
  }
}

function withinRange(
  value: ResolvedTimeSlot,
  context: { readonly timeZone: string; readonly referenceInstant: Date },
): TimeSlotResult {
  const localDateTime =
    value.kind === "instant" ? value.localDateTime : `${value.localDate}T12:00`;
  let epochMilliseconds: number;
  try {
    epochMilliseconds = Temporal.PlainDateTime.from(
      localDateTime,
    ).toZonedDateTime(context.timeZone, {
      disambiguation: "compatible",
    }).epochMilliseconds;
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, issue: "unparsable" };
    throw error;
  }
  const delta = epochMilliseconds - context.referenceInstant.getTime();
  if (delta < -pastToleranceMs || delta > futureHorizonMs) {
    return { ok: false, issue: "out_of_range" };
  }
  return { ok: true, value };
}
