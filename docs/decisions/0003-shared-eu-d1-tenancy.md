# ADR-0003 — Shared EU D1 with mandatory tenant scope

- Status: accepted
- Date: 2026-08-08

## Context

Un database per utente complica provisioning, migration, reporting e spazi condivisi. Un database comune aumenta però il rischio di leakage se le query non incorporano il tenant.

## Decision

Usare un singolo Cloudflare D1 creato fin dall'inizio con `jurisdiction=eu`. Ogni repository tenant-scoped richiede `UserScope { userId }` o `SpaceScope { userId, spaceId }`. Le query per ID includono owner oppure verificano membership e ruolo dello spazio.

## Consequences

Test cross-tenant negativi e indici owner/space sono obbligatori. Lo schema viene modificato soltanto con migration versionate; nessuna modifica manuale in produzione.
