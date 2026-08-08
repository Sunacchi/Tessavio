# ADR-0003 — Shared EU D1 with mandatory tenant scope

- Status: accepted
- Date: 2026-08-08

## Context

Un database per utente complica provisioning, migration, reporting e spazi condivisi. Un database comune aumenta però il rischio di leakage se le query non incorporano il tenant.

## Decision

Usare un singolo Cloudflare D1 creato fin dall'inizio con `jurisdiction=eu`. Ogni repository tenant-scoped richiede `UserScope { userId }` o `SpaceScope { userId, spaceId }`. Le query per ID includono owner oppure verificano membership e ruolo dello spazio.

La giurisdizione limita dove il database D1 esegue e persiste dati; non
regionalizza automaticamente Worker, Queue, Cron, webhook/subrequest Telegram o
provider AI. Questi flussi hanno controlli e gate separati nella
[matrice di residenza e subprocessori](../privacy/PROCESSOR_AND_RESIDENCY_MATRIX.md).

Il singolo D1 condiviso resta una scelta iniziale, non una promessa di scala
illimitata: ogni database è single-threaded, processa query una alla volta e ha
un limite non aumentabile di 10 GB. Prima del pilot si misurano dimensione,
latenza p95, errori `overloaded`, throughput write e Queue lag secondo i trigger
del runbook operativo; superare un trigger riapre la decisione di partizionamento
senza indebolire gli scope tenant.

## Consequences

Test cross-tenant negativi e indici owner/space sono obbligatori. Lo schema viene
modificato soltanto con migration versionate; nessuna modifica manuale in
produzione. Regional Services e un eventuale partizionamento richiedono decisioni
e verifiche esplicite; non sono implicati da `jurisdiction=eu`.
