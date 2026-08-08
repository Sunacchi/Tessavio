# Runbook B4 — Lavoro, migration e recovery

## Scope

Questo runbook copre la migration B4, regole lavoro, turni pianificati,
consuntivi, pause, report e Undo. Non autorizza provisioning o deploy remoto.

## Rollout locale/staging

1. esportare D1 secondo il runbook di provisioning;
2. applicare `0005_milky_gargoyle.sql` a una copia B3 e verificare conteggi e
   schema B3;
3. distribuire il Worker compatibile con schema B3+B4;
4. creare una regola `paid` e una `unpaid`, un turno notturno, un consuntivo e
   pause sintetiche; verificare lettura, giorno, report e Undo;
5. provare gap/fold DST, giornata civile da 23/25 ore, pause fuori intervallo,
   pausa sovrapposta e retry con la stessa idempotency key;
6. verificare i query plan hot prima di abilitare utenti reali.

## Diagnosi senza contenuto personale

Non selezionare o loggare titoli, nomi regola, `before_json` o `after_json`.
Usare solo ID, stati, versioni e conteggi:

```sql
SELECT break_treatment, COUNT(*) FROM work_rules
WHERE user_id = ? GROUP BY break_treatment;

SELECT COUNT(*) FROM planned_shifts
WHERE user_id = ? AND start_at_utc < ? AND end_at_utc > ?;

SELECT COUNT(*) FROM work_logs
WHERE user_id = ? AND start_at_utc < ? AND end_at_utc > ?;

SELECT work_log_id, COUNT(*) FROM work_breaks
WHERE user_id = ? GROUP BY work_log_id LIMIT 100;

SELECT COUNT(*) FROM work_undo_actions
WHERE scope_user_id = ? AND expires_at <= ?;
```

## Failure e recovery

- **retry della stessa create:** mantenere correlation ID e idempotency key; il
  repository restituisce la ricevuta auditata senza duplicare righe o Undo.
- **Undo stale:** una regola è già usata, un consuntivo possiede pause oppure la
  versione è cambiata. Non forzare delete o cascade manuali.
- **Undo used/expired:** nessuna write viene applicata; il purge user-scoped
  elimina al massimo il batch configurato.
- **report inatteso:** verificare finestra UTC derivata da date/timezone, ID
  contributori, snapshot regola e formula `work-report-v1`; non ricalcolare con
  offset fisso o una regola attuale. Un dettaglio troncato nel messaggio non
  altera i totali; restringere il periodo per ispezionare la provenienza.
- **batch D1 fallito:** create, audit e Undo sono atomici; correggere la causa e
  ripetere la stessa idempotency key.
- **shape incoerente:** trattare come finding di integrità senza stampare dati;
  ripristinare una copia con Time Travel/export e confrontare migration/write.

## Rollback

La migration è additiva e il Worker B3 ignora le tabelle B4. Un rollback
applicativo può distribuire B3 lasciando i dati intatti. Non eseguire `DROP
TABLE` in produzione. Ripristinare sempre in un database isolato, validare
schema/conteggi/audit e cambiare binding solo con approvazione.

## Query plan obbligatori

Verificare indici scope/range per turni, consuntivi e pause, scope/list per
regole e scope/expiry per Undo con `EXPLAIN QUERY PLAN`. Prima del pilot misurare
p95, righe lette/scritte, `overloaded` e crescita secondo il runbook pre-pilot.
