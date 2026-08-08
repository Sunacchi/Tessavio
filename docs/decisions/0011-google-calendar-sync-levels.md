# ADR-0011 — Google Calendar a livelli di affidabilità

- Status: accepted
- Date: 2026-08-08

## Context

La baseline collocava Google Calendar in una fase `EXPORT_ONLY` e lasciava la
sincronizzazione bidirezionale fuori scope. Il prodotto approvato richiede sia un
export affidabile sia, in una milestone successiva concreta, import e two-way
sync. D1 e Google non condividono transazioni e possono divergere per retry,
revoche, ricorrenze, all-day, timezone e modifiche concorrenti.

## Decision

Google Calendar è l'unica integrazione esterna nella roadmap corrente e procede
in tre gate:

1. **H1 export controllato:** OAuth least-privilege, calendario scelto, mapping
   tenant/account/calendar scoped, outbox, create/update/delete idempotenti,
   retry/recovery e revoca;
2. **H2 riconciliazione e import:** cursor/channel lifecycle, rilevamento di
   cambi esterni, tombstone e staging delle divergenze senza sovrascrittura
   ambigua;
3. **H3 bidirezionale:** policy conflitti per versione/campo, preview quando
   necessario, loop prevention, audit e recovery.

D1 resta la fonte autorevole delle entità Tessavio. “Autorevole” non significa
ignorare Google: una modifica importata diventa una mutation Tessavio soltanto
dopo mapping, validazione, authorization, idempotenza e conflict policy. È
vietato il last-write-wins cieco.

## Consequences

- H1 può essere rilasciata senza H2/H3, ma i livelli successivi restano milestone
  impegnative della roadmap;
- ogni operazione esterna passa da outbox/delivery ledger e conserva correlation
  ID senza contenuto personale nei log;
- all-day, timezone e ricorrenze hanno mapping e test espliciti;
- OAuth, sync e conflitti si testano con adapter fake; credenziali reali non sono
  necessarie alla suite;
- disconnessione revoca quando possibile, elimina token locali e ferma nuovi job
  senza cancellare implicitamente gli eventi autorevoli D1.

## Revisit when

Le API Google cambiano, i dati pilot mostrano conflitti non rappresentabili dalla
policy, oppure si propone un secondo provider calendario.
