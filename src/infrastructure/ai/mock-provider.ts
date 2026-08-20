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
  amount: null,
  category: null,
  entry_kind: null,
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
  /^(?:(?:di|del|dello|della|dei|degli|delle|il|lo|la|i|le|gli|un|uno|una|dal|dalla|dallo)\s+|l'|un'|dell')/iu;

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
    /\b(?:crea|nuova|apri|aggiungi|metti)\b[^.]{0,40}\blista\b/u.test(lower)
  ) {
    const listReference =
      /\b(?:alla|nella|in)\s+lista\s+(?:della\s+|dello\s+|dei\s+|delle\s+)?([a-zàèéìòù0-9 ]+)$/iu.exec(
        text,
      )?.[1] ?? null;
    if (listReference !== null || /\baggiungi\b|\bmetti\b/u.test(lower)) {
      const item =
        /\b(?:aggiungi|metti)\s+(.+?)\s+(?:alla|nella|in)\s+lista\b/iu.exec(
          text,
        )?.[1] ?? null;
      if (item !== null && listReference !== null) {
        return {
          action: "lists.item.create",
          confidence: "high",
          assumptions: [],
          payload: { ...emptyPayload, text: item, reference: listReference },
        };
      }
    }
    return {
      action: "lists.create",
      confidence: "high",
      assumptions: [],
      payload: {
        ...emptyPayload,
        title: cleanSubject(text, [
          "crea",
          "nuova",
          "apri",
          "la lista",
          "lista",
        ]),
      },
    };
  }

  // Un movimento richiede una cifra: senza importo non è una spesa, è una frase.
  if (
    /\d/u.test(lower) &&
    /\b(spes[oa]|pagat[oa]|incassat[oa]|costat[oa]|euro|eur|dollari|sterline)\b|€|\$|£/u.test(
      lower,
    )
  ) {
    const amount =
      /(\d[\d.,]*)\s*(?:euro|eur|€|dollari|usd|\$|sterline|gbp|£)?/iu.exec(
        text,
      )?.[0] ?? null;
    const category =
      /\b(?:per|al|allo|alla|in|di)\s+(?:il|lo|la|i|gli|le|un|una|l')?\s*([a-zàèéìòù]+)\s*$/iu.exec(
        stripTime(text),
      )?.[1] ?? null;
    return {
      action: "finance.create",
      confidence: amount === null ? "low" : "high",
      assumptions: [],
      payload: {
        ...emptyPayload,
        amount,
        entry_kind: /\bincassat[oa]|entrata\b/u.test(lower)
          ? "entrata"
          : "spesa",
        category,
        when: extractTime(text),
      },
    };
  }

  if (/\b(turno)\b/u.test(lower)) {
    const times = extractTimes(text);
    return {
      action: "work.shift.create",
      confidence: times.whenEnd === null ? "low" : "high",
      assumptions: [],
      payload: {
        ...emptyPayload,
        title: cleanSubject(text, [
          "segna",
          "aggiungi",
          "crea",
          "il turno",
          "turno",
        ]),
        when: times.when,
        when_end: times.whenEnd,
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
