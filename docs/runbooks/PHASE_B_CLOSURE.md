# Phase B — Evidenza di chiusura

Questo runbook riproduce il gate trasversale del core deterministico. Non crea
risorse Cloudflare remote, non applica migration remote e non attiva C1.

## Contratto verificato

- `/oggi` mostra eventi, task, reminder operativi e turni pianificati nella
  finestra civile IANA derivata dal timestamp Telegram;
- ogni contributor è autorizzato e user-scoped prima della lettura;
- tutte le categorie Undo B scadono dopo 15 minuti e la purge bounded è
  idempotente e isolata per tenant;
- il delivery ledger elimina solo record terminali user-scoped più vecchi di 30
  giorni, preservando tentativi attivi;
- B1-B7 funzionano attraverso webhook, Queue, D1, report CSV e Undo senza
  provider, binding o credenziali AI.

## Riproduzione mirata

```powershell
npx vitest run tests/integration/phase-b-demo.test.ts
npx vitest run tests/integration/phase-b-retention.test.ts
npx vitest run tests/integration/reminder-flow.test.ts tests/security/reminders-security.test.ts tests/integration/migration.test.ts
```

La demo usa solo fixture sintetiche, clock e ID deterministici. I contenuti
personali non entrano nei log e il CSV rimane in memoria nel fake Telegram.

## Firma locale

Eseguire dalla root:

```powershell
npm run validate
```

Firma del 2026-08-19: format, lint, type generation check, typecheck,
`drizzle-kit check`, 33 file Vitest e 148 test verdi; build Worker dry-run
verde. Nessun deploy, provisioning o mutazione remota è parte del gate.

## Recovery e limiti

- La vista giornaliera è read-only: rollback applicativo rimuove il contributor
  reminder senza modifica schema.
- La purge è bounded a 100 righe per invocazione. Ripeterla è sicuro e produce
  zero modifiche quando non restano record eleggibili.
- `pending|sending` del delivery ledger non vengono eliminati; prima di una
  correzione manuale seguire il runbook B2 e conservare dedupe key e scope.
- La cancellazione account completa e una sweep fisica per utenti inattivi
  restano gate I2/pre-pilot; la TTL funzionale degli Undo è già applicata.

Decisione: [ADR-0021](../decisions/0021-phase-b-closure.md).
