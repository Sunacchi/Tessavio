# Runbook di sviluppo

## Prima di iniziare

1. leggere `AGENTS.md` e quello più vicino ai file;
2. leggere `docs/planning/CURRENT_MILESTONE.md`;
3. controllare working tree e modifiche utente;
4. definire un risultato bounded e i test;
5. verificare documentazione ufficiale e versione prima di introdurre dipendenze o usare API mutevoli.

## Dipendenze

- fissare versioni esatte, senza `latest`;
- preferire installazione minima;
- motivare nuove dipendenze runtime;
- aggiornare lockfile e ADR quando la scelta è architetturale;
- non introdurre `rrule`, Workflow, Google o AI prima della rispettiva fase.

A1 usa Node.js 24.13.1, npm 11.8.0 e `npm ci`. La CI esegue lo stesso lockfile.

`npm audit --omit=dev` deve restare verde. L'audit completo segnala al
2026-08-08 un advisory moderato nel vecchio esbuild transitivo di Drizzle Kit:
è solo tooling dev, non entra nel bundle Worker e non va esposto come dev server.
Non applicare il downgrade automatico proposto da npm; riesaminare a ogni release
Drizzle compatibile e prima della beta.

## Ambienti

- dev: bot dev, D1 dev, fake AI/test key;
- staging: bot staging, D1 EU staging, provider test;
- prod: bot prod, D1 EU prod, secret prod.

Mai usare token prod in locale. La creazione o modifica di risorse remote richiede autorizzazione esplicita dell'utente.

Per bootstrap e recovery vedere [D1_PROVISIONING.md](D1_PROVISIONING.md) e
[A1_RECOVERY.md](A1_RECOVERY.md).

## Comandi A1

```powershell
npm run format:check
npm run lint
npm run cf-typegen:check
npm run typecheck
npm run db:check
npm run test:unit
npm run test:integration
npm run test:security
npm run build
```

## Prima del handoff

Eseguire i controlli disponibili e pertinenti nell'ordine: format/lint, typecheck, unit, integration, security, migration validation e benchmark smoke. Dichiarare chiaramente ciò che non è stato eseguito.

Aggiornare milestone/backlog/ADR se scope o decisioni sono cambiati. Non dichiarare conclusa una feature che non supera la Definition of Done applicabile.
