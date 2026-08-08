# ADR-0006 — Development orchestration and code graph

- Status: accepted
- Date: 2026-08-08

## Context

Ruflo può orchestrare loop Codex persistenti e bounded; Graphify può visualizzare relazioni nel repository. Entrambi hanno costo operativo e non appartengono al runtime del bot.

## Decision

- Ruflo è dev-only tramite adapter Codex, con installazione minima, versioni esatte e niente template `full`.
- Prima di installare, verificare release e compatibilità. Il controllo del 2026-08-08 riportava Ruflo `3.34.0` e `@claude-flow/codex` `3.0.2`; questi valori sono evidenza datata, non autorizzazione a installarli senza riconferma.
- Ogni loop deve avere condizione di arresto, limite di iterazioni/tempo e stato persistito su file revisionabile.
- Graphify è dev-only e viene eseguito dopo una vertical slice o alla fine di milestone/refactor, mai sul repository vuoto o a ogni iterazione.

## Consequences

Nessuno dei due pacchetti entra nelle dipendenze runtime. Lockfile e documentazione devono rendere riproducibile qualunque installazione futura. La configurazione Graphify, quando introdotta, sarà project-scoped e seguirà il README della versione fissata.
