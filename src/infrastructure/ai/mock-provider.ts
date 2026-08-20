import type {
  AiProviderPort,
  AiProviderRequest,
  AiProviderResult,
} from "../../application/ports/ai";
import type { AiAction } from "../../domains/ai/proposal";
import { aiProposalSchemaVersion } from "../../domains/ai/proposal";

/**
 * Provider **mock deterministico**: nessuna rete, nessuna credenziale, nessun
 * costo. Serve a chiudere schema, validator, policy, idempotenza e benchmark
 * prima che OAuth e cifratura esistano (C1 di ADR-0023).
 *
 * Estrae con regole esplicite ciò che un modello estrarrebbe con un prompt, e
 * rispetta la regola d'oro: restituisce il **testo grezzo** dello slot.
 */
interface DraftProposal {
  readonly action: AiAction;
  readonly confidence: "high" | "low";
  readonly assumptions: readonly string[];
  readonly payload: Record<string, string | boolean | null>;
}

const emptyPayload = {
  title: null,
  text: null,
  when: null,
  when_end: null,
  all_day: null,
  priority: null,
  reference: null,
} as const;

const timePattern =
  /((?:\bdopodomani\b|\bdomani\b|\boggi\b|\bstasera\b|\bstamattina\b|\blunedi\b|\blunedì\b|\bmartedi\b|\bmartedì\b|\bmercoledi\b|\bmercoledì\b|\bgiovedi\b|\bgiovedì\b|\bvenerdi\b|\bvenerdì\b|\bsabato\b|\bdomenica\b|\b\d{4}-\d{2}-\d{2}\b|\bfra\s+\d+\s+\w+\b|\btra\s+\d+\s+\w+\b)(?:\s+(?:alle|ore)\s+\d{1,2}(?:[:.]\d{2})?)?|(?:\balle\b|\bore\b)\s*\d{1,2}(?:[:.]\d{2})?|\bmattina\b|\bpomeriggio\b|\bsera\b|\bmezzogiorno\b)/iu;

function splitIntents(text: string): readonly string[] {
  return text
    .split(/;|\be poi\b|\binoltre\b|\balle fine\b/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 3);
}

function extractTimes(text: string): {
  readonly when: string | null;
  readonly whenEnd: string | null;
} {
  const matches = Array.from(
    text.matchAll(new RegExp(timePattern.source, "giu")),
  ).map((match) => match[0].trim());
  const [first, second] = matches;
  if (first === undefined) return { when: null, whenEnd: null };
  if (second === undefined) return { when: first, whenEnd: null };

  const firstHasClockTime =
    /(?:alle|ore)\s*\d|\d{1,2}[:.]\d{2}|t\d{2}:\d{2}/iu.test(first);
  const secondHasDay =
    /\d{4}-\d{2}-\d{2}|domani|oggi|dopodomani|luned|marted|mercoled|gioved|venerd|sabato|domenica/iu.test(
      second,
    );
  // "domani pomeriggio": il giorno e la parte del giorno sono un solo slot,
  // non un intervallo.
  if (!firstHasClockTime && !secondHasDay) {
    return { when: `${first} ${second}`, whenEnd: null };
  }

  // "domani alle 15 alle 16": la seconda ora eredita il giorno della prima.
  const dayPrefix = /^(.*?)(?:\s+(?:alle|ore)\s+\d{1,2}(?:[:.]\d{2})?)$/u.exec(
    first,
  )?.[1];
  const whenEnd =
    dayPrefix === undefined || secondHasDay ? second : `${dayPrefix} ${second}`;
  return { when: first, whenEnd };
}

function extractTime(text: string): string | null {
  return extractTimes(text).when;
}

function stripTime(text: string): string {
  return text
    .replace(new RegExp(timePattern.source, "giu"), " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const leadingArticles =
  /^(?:di|del|dello|della|dei|degli|delle|il|lo|la|i|le|gli|un|uno|una|l'|un'|dal|dalla|dallo)\s*/iu;

function cleanSubject(text: string, leadings: readonly string[]): string {
  let subject = stripTime(text);
  for (const leading of leadings) {
    subject = subject.replace(new RegExp(`^${leading}\\b\\s*`, "iu"), "");
    subject = subject.replace(leadingArticles, "");
  }
  let previous = "";
  while (previous !== subject) {
    previous = subject;
    for (const leading of leadings) {
      subject = subject.replace(new RegExp(`^${leading}\\b\\s*`, "iu"), "");
    }
    subject = subject.replace(leadingArticles, "");
  }
  return subject.trim();
}

function draft(intent: string): DraftProposal | null {
  const text = intent.trim();
  const lower = text.toLowerCase();

  if (
    /\b(che cosa|cosa|che)\b.*\b(ho|c'e|c'è|in programma)\b.*\b(oggi|giornata)\b/u.test(
      lower,
    ) ||
    /^\/?(oggi|agenda di oggi)$/u.test(lower)
  ) {
    return {
      action: "query.today",
      confidence: "high",
      assumptions: [],
      payload: { ...emptyPayload },
    };
  }

  if (/\b(ricordami|promemoria|ricordarmi)\b/u.test(lower)) {
    if (/\b(annulla|cancella|elimina|togli)\b/u.test(lower)) {
      return {
        action: "reminders.cancel",
        confidence: "high",
        assumptions: [],
        payload: {
          ...emptyPayload,
          reference: cleanSubject(text, [
            "annulla",
            "cancella",
            "elimina",
            "togli",
            "il promemoria",
            "promemoria",
          ]),
        },
      };
    }
    return {
      action: "reminders.create",
      confidence: "high",
      assumptions: [],
      payload: {
        ...emptyPayload,
        text: cleanSubject(text, ["ricordami", "ricordarmi", "promemoria"]),
        when: extractTime(text),
      },
    };
  }

  if (/\b(task|attivita|attività|to-?do)\b/u.test(lower)) {
    if (/\b(completa|completata|fatto|fatta|chiudi)\b/u.test(lower)) {
      return {
        action: "tasks.complete",
        confidence: "high",
        assumptions: [],
        payload: {
          ...emptyPayload,
          reference: cleanSubject(text, [
            "completa",
            "chiudi",
            "segna come fatto",
            "la task",
            "task",
            "attivita",
            "attività",
          ]),
        },
      };
    }
    return {
      action: "tasks.create",
      confidence: "high",
      assumptions: [],
      payload: {
        ...emptyPayload,
        title: cleanSubject(text, [
          "aggiungi",
          "crea",
          "nuova",
          "nuovo",
          "task",
          "attivita",
          "attività",
        ]),
        when: extractTime(text),
        priority: /\b(urgente|alta priorita|alta priorità)\b/u.test(lower)
          ? "alta"
          : null,
      },
    };
  }

  if (
    /\b(evento|appuntamento|riunione|incontro|cena|pranzo|visita|call)\b/u.test(
      lower,
    )
  ) {
    if (/\b(annulla|cancella|disdici|elimina)\b/u.test(lower)) {
      return {
        action: "events.cancel",
        confidence: "high",
        assumptions: [],
        payload: {
          ...emptyPayload,
          reference: cleanSubject(text, [
            "annulla",
            "cancella",
            "disdici",
            "elimina",
            "l'evento",
            "evento",
            "appuntamento",
          ]),
        },
      };
    }
    const times = extractTimes(text);
    return {
      action: "events.create",
      confidence: times.when === null ? "low" : "high",
      assumptions: [],
      payload: {
        ...emptyPayload,
        title: cleanSubject(text, [
          "aggiungi",
          "crea",
          "segna",
          "metti",
          "un",
          "una",
          "evento",
          "appuntamento",
          "riunione",
        ]),
        when: times.when,
        when_end: times.whenEnd,
      },
    };
  }
  return null;
}

export class MockAiProvider implements AiProviderPort {
  propose(request: AiProviderRequest): Promise<AiProviderResult> {
    const enabled = new Set<string>(request.context.enabledActions);
    const proposals = splitIntents(request.context.messageText)
      .map(draft)
      .filter((proposal): proposal is DraftProposal => proposal !== null)
      .filter((proposal) => enabled.has(proposal.action));

    const envelope = {
      schema_version: aiProposalSchemaVersion,
      proposals,
      clarification:
        proposals.length === 0
          ? "Non ho capito che cosa vuoi fare: puoi dirlo con un verbo e una data?"
          : null,
    };
    return Promise.resolve({
      rawJson: JSON.stringify(envelope),
      model: request.model,
      costMicros: 0,
      latencyMs: 0,
    });
  }
}
