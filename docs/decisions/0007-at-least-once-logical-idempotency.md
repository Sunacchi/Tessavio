# ADR-0007 — At-least-once transport and logical idempotency

- Status: accepted
- Date: 2026-08-08

## Context

D1, Cloudflare Queue e Telegram Bot API non condividono una transazione. Un crash
può avvenire dopo la registrazione di un update ma prima del publish, oppure dopo
un invio Telegram ma prima del salvataggio dell'esito. Promettere exactly-once
enqueue o reply nasconderebbe questi failure window e potrebbe favorire perdita
di update o doppia esecuzione del dominio.

## Decision

Webhook e Queue usano semantica at-least-once. `update_id`, `job_id` ed effect key
stabili, insieme a stati inbox/effect durevoli e recuperabili, garantiscono una
sola esecuzione logica e una sola domain write/audit. Più enqueue fisiche sono
ammesse e devono convergere sullo stesso esito.

Ogni side effect esterno usa un delivery ledger e una policy esplicita. Quando il
provider ha ricevuto la richiesta ma l'esito locale è ambiguo, il sistema non
finge atomicità: non ripete la domain write, applica la policy at-most/at-least-once
scelta per quel tipo di delivery e rende osservabile/recoverable l'ambiguità senza
contenuto personale nei log.

## Consequences

- il record di deduplica non è un semplice “seen flag”: deve supportare claim,
  stato e recovery del publish;
- i consumer rivalidano l'envelope e deduplicano per effect key prima di mutare;
- test di fault injection coprono i crash prima/dopo inbox commit, enqueue, domain
  commit, external send e ack;
- i criteri di uscita parlano di una sola esecuzione logica, non di una sola
  consegna fisica;
- la UX ordinaria mira a una reply; un timeout remoto ambiguo segue la policy
  documentata e non può provocare una seconda domain write.

## Revisit when

Cloudflare o Telegram offrano una primitive transazionale verificata che copra
gli stessi confini, oppure le metriche beta mostrino che la policy di delivery
scelta produce un tasso di ambiguità non accettabile.
