# ADR-0002 — Deterministic core and AI proposal boundary

- Status: accepted
- Date: 2026-08-08

## Context

I modelli possono fallire, cambiare comportamento, produrre output invalido e avere costi o policy variabili. Non possono essere la fonte della verità organizzativa.

## Decision

L'AI è un adapter provider-agnostic. Per mutazioni produce `ActionProposal[]` strict con payload, assunzioni e ambiguità. Il server valida schema, tenant, date, permessi, conflitti, duplicati e budget; una policy decide esecuzione o preview; il servizio di dominio applica la modifica.

Il planner calcola slot e vincoli deterministicamente. L'AI può interpretare richieste e spiegare il piano.

## Consequences

Comandi espliciti e funzioni core restano disponibili in modalità `NO_AI`. Prompt e modello possono evolvere senza cambiare il dominio. Ogni modifica AI richiede schema test e benchmark.
