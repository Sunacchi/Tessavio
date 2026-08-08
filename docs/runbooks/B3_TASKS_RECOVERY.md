# Runbook B3 — Task, migration e recovery

## Scope

Questo runbook copre la migration `0004_low_moondragon.sql`, le task private,
complete/reopen e Undo. Non autorizza provisioning o deploy remoto.

## Rollout locale/staging

1. eseguire backup/export D1 secondo il runbook di provisioning;
2. applicare migration 0004 a una copia B2 e verificare che le tabelle B2 e i
   relativi conteggi non cambino;
3. distribuire il Worker compatibile con schema B2+B3;
4. eseguire con un utente sintetico create `none`, `date_only` e `instant`,
   list, `/oggi`, complete, reopen e Undo;
5. verificare un gap e un fold DST rifiutati e un retry con la stessa
   idempotency key prima di abilitare utenti reali.

## Diagnosi senza contenuto personale

Usare solo ID, stati, tipi e conteggi; non selezionare o loggare `title`,
`before_json` o `after_json`:

```sql
SELECT status, due_kind, priority, COUNT(*) AS total
FROM tasks
GROUP BY status, due_kind, priority;

SELECT id, user_id, status, due_kind, version, updated_at
FROM tasks
WHERE user_id = ?
ORDER BY updated_at DESC
LIMIT 100;

SELECT COUNT(*) AS expired_undo
FROM task_undo_actions
WHERE scope_user_id = ? AND expires_at <= ?;
```

## Failure e recovery

- **retry della stessa mutation:** mantenere correlation ID e idempotency key;
  il repository restituisce l'`after_json` già auditato senza una seconda write.
- **Undo `stale`:** una mutation successiva ha cambiato la versione; non forzare
  restore o editare la riga a mano.
- **Undo `used` o `expired`:** nessuna modifica è applicata. Il purge user-scoped
  rimuove fino a 100 record scaduti per invocazione.
- **batch D1 fallito:** create/transition, audit e Undo sono atomici. Correggere
  la causa e ripetere con la stessa idempotency key.
- **dato con shape incoerente:** trattare come finding di integrità; non stampare
  il record. Ripristinare una copia tramite Time Travel/export e investigare la
  migration o una write non autorizzata.

## Rollback e recovery migration

La migration è additiva e il Worker B2 ignora le tabelle B3. Un rollback
applicativo può quindi distribuire il Worker B2 lasciando intatti i dati task.
Non eseguire `DROP TABLE` in produzione. Per recovery, ripristinare backup/Time
Travel in un database isolato, validare schema, conteggi e audit, poi cambiare il
binding soltanto con approvazione.

## Query plan obbligatori

Verificare con `EXPLAIN QUERY PLAN`:

- `tasks_scope_status_idx` per la lista aperta;
- `tasks_scope_date_idx` per le scadenze date-only giornaliere;
- `tasks_scope_instant_idx` per le scadenze instant nella finestra civile;
- `task_undo_scope_expiry_idx` per purge bounded e user-scoped.

Prima del pilot misurare p95, righe lette/scritte, errori `overloaded` e crescita
delle task secondo il runbook pre-pilot.
