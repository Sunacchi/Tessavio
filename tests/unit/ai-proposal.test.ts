import { describe, expect, it } from "vitest";
import { resolveTimeSlot } from "../../src/domains/ai/time-slot";
import {
  aiProposalSchemaVersion,
  c12Actions,
  type AiPayload,
  type AiProposalEnvelope,
} from "../../src/domains/ai/proposal";
import {
  validateProposalBatch,
  type ProposalValidationContext,
} from "../../src/domains/ai/validate-proposal";

const timeZone = "Europe/Rome";
const reference = new Date("2026-08-20T08:00:00Z");

const emptyPayload: AiPayload = {
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
};

function envelope(
  proposals: readonly {
    action: (typeof c12Actions)[number];
    payload: Partial<AiPayload>;
    assumptions?: readonly string[];
  }[],
): AiProposalEnvelope {
  return {
    schema_version: aiProposalSchemaVersion,
    proposals: proposals.map((proposal) => ({
      action: proposal.action,
      confidence: "high",
      assumptions: proposal.assumptions ?? [],
      payload: { ...emptyPayload, ...proposal.payload },
    })),
    clarification: null,
  };
}

const context: ProposalValidationContext = {
  enabledActions: c12Actions,
  timeZone,
  referenceInstant: reference,
  defaultCurrency: "EUR",
  candidates: {
    events: [{ id: "evt-1", label: "Riunione con Marco" }],
    reminders: [{ id: "rem-1", label: "Comprare il latte" }],
    tasks: [
      { id: "tsk-1", label: "Relazione trimestrale" },
      { id: "tsk-2", label: "Relazione annuale" },
    ],
    lists: [{ id: "lst-1", label: "Spesa" }],
  },
};

describe("C1 risoluzione deterministica degli slot temporali", () => {
  it("risolve le forme esplicite senza assumere nulla", () => {
    expect(
      resolveTimeSlot("domani alle 15", {
        timeZone,
        referenceInstant: reference,
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: "instant",
        localDateTime: "2026-08-21T15:00",
        assumed: false,
        assumptions: [],
      },
    });
    expect(
      resolveTimeSlot("2026-09-03T09:30", {
        timeZone,
        referenceInstant: reference,
      }),
    ).toMatchObject({
      ok: true,
      value: { kind: "instant", localDateTime: "2026-09-03T09:30" },
    });
    expect(
      resolveTimeSlot("dopodomani", { timeZone, referenceInstant: reference }),
    ).toMatchObject({
      ok: true,
      value: { kind: "date_only", localDate: "2026-08-22" },
    });
  });

  it("dichiara l'assunzione quando interpreta una parte del giorno", () => {
    const result = resolveTimeSlot("domani pomeriggio", {
      timeZone,
      referenceInstant: reference,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "instant",
        localDateTime: "2026-08-21T15:00",
        assumed: true,
      },
    });
  });

  it("sposta a domani un orario già passato e lo dichiara", () => {
    const result = resolveTimeSlot("alle 9", {
      timeZone,
      referenceInstant: reference,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: "instant",
        localDateTime: "2026-08-21T09:00",
        assumed: true,
      },
    });
  });

  it("rifiuta un'ora che non esiste per il cambio DST", () => {
    expect(
      resolveTimeSlot("domani alle 2:30", {
        timeZone,
        referenceInstant: new Date("2026-03-28T10:00:00Z"),
      }),
    ).toEqual({ ok: false, issue: "ambiguous_local_time" });
  });

  it("rifiuta una data fuori dall'intervallo plausibile e un testo non interpretabile", () => {
    expect(
      resolveTimeSlot("2035-01-01", { timeZone, referenceInstant: reference }),
    ).toEqual({ ok: false, issue: "out_of_range" });
    expect(
      resolveTimeSlot("quando capita", {
        timeZone,
        referenceInstant: reference,
      }),
    ).toEqual({ ok: false, issue: "unparsable" });
  });
});

describe("C1 validator semantico", () => {
  it("risolve un evento completo senza assunzioni sulla data", () => {
    const [result] = validateProposalBatch(
      envelope([
        {
          action: "events.create",
          payload: {
            title: "Dentista",
            when: "domani alle 15",
            when_end: "domani alle 16",
          },
        },
      ]),
      context,
    );
    expect(result).toMatchObject({
      outcome: "valid",
      action: "events.create",
      resolution: "resolved",
      slots: {
        title: "Dentista",
        startLocal: "2026-08-21T15:00",
        endLocal: "2026-08-21T16:00",
      },
    });
  });

  it("applica la durata predefinita senza declassare la risoluzione", () => {
    const [result] = validateProposalBatch(
      envelope([
        {
          action: "events.create",
          payload: { title: "Call", when: "domani alle 15" },
        },
      ]),
      context,
    );
    expect(result).toMatchObject({
      outcome: "valid",
      resolution: "resolved",
      slots: { endLocal: "2026-08-21T16:00" },
      assumptions: ["durata predefinita: 1 ora"],
    });
  });

  it("chiede chiarimenti invece di inventare uno slot mancante", () => {
    const [missingTitle] = validateProposalBatch(
      envelope([
        { action: "events.create", payload: { when: "domani alle 15" } },
      ]),
      context,
    );
    expect(missingTitle).toMatchObject({
      outcome: "clarify",
      reason: "missing_slot",
    });
    const [reminderWithoutHour] = validateProposalBatch(
      envelope([
        {
          action: "reminders.create",
          payload: { text: "Pillola", when: "domani" },
        },
      ]),
      context,
    );
    expect(reminderWithoutHour).toMatchObject({
      outcome: "clarify",
      reason: "time_needs_hour",
    });
  });

  it("rifiuta uno slot estraneo all'azione", () => {
    const [result] = validateProposalBatch(
      envelope([
        {
          action: "events.create",
          payload: {
            title: "Cena",
            when: "domani alle 20",
            reference: "evt-1",
          },
        },
      ]),
      context,
    );
    expect(result).toMatchObject({
      outcome: "reject",
      reason: "extraneous_slot",
    });
  });

  it("risolve un riferimento solo quando è unico", () => {
    const [single] = validateProposalBatch(
      envelope([
        {
          action: "events.cancel",
          payload: { reference: "riunione con marco" },
        },
      ]),
      context,
    );
    expect(single).toMatchObject({
      outcome: "valid",
      slots: { entityId: "evt-1" },
    });
    const [ambiguous] = validateProposalBatch(
      envelope([
        { action: "tasks.complete", payload: { reference: "relazione" } },
      ]),
      context,
    );
    expect(ambiguous).toMatchObject({
      outcome: "clarify",
      reason: "reference_ambiguous",
    });
    const [missing] = validateProposalBatch(
      envelope([
        {
          action: "reminders.cancel",
          payload: { reference: "pagare la bolletta" },
        },
      ]),
      context,
    );
    expect(missing).toMatchObject({
      outcome: "clarify",
      reason: "reference_not_found",
    });
  });

  it("non inventa mai un ID: lo schema non ha un campo ID", () => {
    const [result] = validateProposalBatch(
      envelope([
        { action: "events.cancel", payload: { reference: "evt-999" } },
      ]),
      context,
    );
    expect(result).toMatchObject({ outcome: "clarify" });
  });

  it("collassa i duplicati dentro lo stesso messaggio", () => {
    const results = validateProposalBatch(
      envelope([
        {
          action: "tasks.create",
          payload: { title: "Spesa", priority: "alta" },
        },
        {
          action: "tasks.create",
          payload: { title: "Spesa", priority: "alta" },
        },
      ]),
      context,
    );
    expect(results[0]).toMatchObject({ outcome: "valid" });
    expect(results[1]).toMatchObject({
      outcome: "reject",
      reason: "duplicate_in_batch",
    });
  });

  it("rifiuta un'azione non abilitata per la fase", () => {
    const [result] = validateProposalBatch(
      envelope([
        {
          action: "events.cancel",
          payload: { reference: "riunione con marco" },
        },
      ]),
      { ...context, enabledActions: ["events.create"] },
    );
    expect(result).toMatchObject({
      outcome: "reject",
      reason: "action_not_enabled",
    });
  });

  it("applica la priorità predefinita e la dichiara", () => {
    const [result] = validateProposalBatch(
      envelope([{ action: "tasks.create", payload: { title: "Relazione" } }]),
      context,
    );
    expect(result).toMatchObject({
      outcome: "valid",
      resolution: "resolved",
      slots: { priority: "media", due: "nessuna" },
      assumptions: ["priorità predefinita: media"],
    });
  });
});

describe("C1.2 azioni estese a lavoro, finanze e liste", () => {
  it("risolve un movimento con importo, valuta e categoria", () => {
    const [result] = validateProposalBatch(
      envelope([
        {
          action: "finance.create",
          payload: {
            amount: "12,50 euro",
            category: "spesa",
            entry_kind: "spesa",
            when: "2026-08-20",
          },
        },
      ]),
      context,
    );
    expect(result).toMatchObject({
      outcome: "valid",
      resolution: "resolved",
      slots: {
        amountMinor: "1250",
        currency: "EUR",
        entryKind: "expense",
        category: "spesa",
        localDate: "2026-08-20",
      },
    });
  });

  it("usa data e tipo predefiniti dichiarandoli, senza inventare l'importo", () => {
    const [withDefaults] = validateProposalBatch(
      envelope([
        { action: "finance.create", payload: { amount: "8", category: "bar" } },
      ]),
      context,
    );
    expect(withDefaults).toMatchObject({
      outcome: "valid",
      resolution: "resolved",
      slots: { entryKind: "expense", localDate: "2026-08-20" },
    });
    const [withoutAmount] = validateProposalBatch(
      envelope([{ action: "finance.create", payload: { category: "bar" } }]),
      context,
    );
    expect(withoutAmount).toMatchObject({
      outcome: "clarify",
      reason: "missing_slot",
    });
  });

  it("chiede la categoria invece di sceglierne una", () => {
    const [result] = validateProposalBatch(
      envelope([
        { action: "finance.create", payload: { amount: "12,50 euro" } },
      ]),
      context,
    );
    expect(result).toMatchObject({
      outcome: "clarify",
      reason: "missing_slot",
    });
  });

  it("aggiunge un elemento solo a una lista che esiste", () => {
    const [found] = validateProposalBatch(
      envelope([
        {
          action: "lists.item.create",
          payload: { text: "latte", reference: "spesa" },
        },
      ]),
      context,
    );
    expect(found).toMatchObject({
      outcome: "valid",
      slots: { text: "latte", entityId: "lst-1" },
    });
    const [missing] = validateProposalBatch(
      envelope([
        {
          action: "lists.item.create",
          payload: { text: "latte", reference: "lista che non esiste" },
        },
      ]),
      context,
    );
    expect(missing).toMatchObject({
      outcome: "clarify",
      reason: "reference_not_found",
    });
  });

  it("non assume la durata di un turno di lavoro", () => {
    const [complete] = validateProposalBatch(
      envelope([
        {
          action: "work.shift.create",
          payload: {
            title: "Serale",
            when: "domani alle 14",
            when_end: "domani alle 22",
          },
        },
      ]),
      context,
    );
    expect(complete).toMatchObject({
      outcome: "valid",
      slots: {
        startLocal: "2026-08-21T14:00",
        endLocal: "2026-08-21T22:00",
      },
    });
    const [withoutEnd] = validateProposalBatch(
      envelope([
        {
          action: "work.shift.create",
          payload: { title: "Serale", when: "domani alle 14" },
        },
      ]),
      context,
    );
    expect(withoutEnd).toMatchObject({
      outcome: "clarify",
      reason: "time_needs_hour",
    });
  });

  it("rifiuta uno slot monetario su un'azione che non lo prevede", () => {
    const [result] = validateProposalBatch(
      envelope([
        {
          action: "tasks.create",
          payload: { title: "Spesa", amount: "12,50 euro" },
        },
      ]),
      context,
    );
    expect(result).toMatchObject({
      outcome: "reject",
      reason: "extraneous_slot",
    });
  });
});
