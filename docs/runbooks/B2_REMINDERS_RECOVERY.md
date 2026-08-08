# Runbook B2 — Reminder, Queue e recovery

## Scope

Questo runbook copre la migration `0003_giant_mentor.sql`, claim/enqueue di
`SEND_NOTIFICATION`, delivery Telegram e DLQ. Non autorizza provisioning o
deploy remoto.

## Rollout locale/staging

1. eseguire backup/export D1 secondo il runbook di provisioning;
2. applicare migration 0003 a una copia B1 e verificare che le preferenze
   esistenti abbiano quiet hours `NULL`;
3. distribuire il Worker compatibile con schema B1+B2;
4. creare separatamente Queue notification e DLQ con retention approvata, poi
   configurare binding/consumer/Cron;
5. verificare un reminder sintetico futuro, uno nelle quiet hours e un rifiuto
   Telegram simulato prima di abilitare utenti reali.

## Diagnosi senza contenuto personale

Usare solo ID/codici/stati:

```sql
SELECT status, COUNT(*) AS total
FROM reminders
GROUP BY status;

SELECT id, user_id, claim_job_id, claimed_at, claim_expires_at,
       enqueued_at, attempt_count, last_error_code
FROM reminders
WHERE status IN ('claimed', 'sending')
ORDER BY claimed_at
LIMIT 100;

SELECT status, COUNT(*) AS total
FROM notification_deliveries
GROUP BY status;
```

Non stampare `reminders.text`, token, envelope completi o Telegram ID nei log.

## Failure e recovery

- **claimed, `enqueued_at IS NULL`:** attendere
  `REMINDER_ENQUEUE_RECOVERY_SECONDS`; Cron ripubblica lo stesso job.
- **claimed con lease scaduta:** Cron ripubblica lo stesso envelope. Non creare
  manualmente un nuovo reminder o una nuova dedupe key.
- **sending:** non forzare retry Telegram. Il replay converge a `ambiguous`;
  riconciliare manualmente.
- **retryable:** Queue ritenta con delay; dopo 6 chiamate esterne il reminder
  passa a `permanent_failure` anche attraverso recovery successivi.
- **permanent_failure:** correggere destinazione/provider prima di una futura
  procedura esplicita di replay; B2 non resetta automaticamente lo stato.
- **ambiguous:** verificare fuori banda se il messaggio è arrivato. La policy
  at-most-once vieta il replay automatico.
- **DLQ:** preservare body, job ID, correlation ID e idempotency key durante
  export/replay. Alertare su ogni messaggio prima del pilot; retention e accesso
  alla DLQ vanno approvati nell'account Cloudflare.

## Rollback e recovery migration

Il Worker B1 non legge le nuove tabelle e ignora le nuove colonne nullable, ma
il rollback dell'applicazione deve prima fermare Cron e consumer notification.
La migration non viene invertita distruttivamente in produzione: ripristinare
il backup D1 in un database isolato, validare conteggi/audit e cambiare binding
solo con approvazione. Non eliminare reminder o ledger per sbloccare un deploy.

## Query plan obbligatori

Verificare `reminders_due_claim_idx`, `reminders_scope_list_idx`,
`reminders_recovery_idx` e `reminder_undo_scope_expiry_idx` con
`EXPLAIN QUERY PLAN`. Prima del pilot misurare p95, righe lette/scritte, queue
lag, reminder stuck, retry e DLQ come definito nel runbook pre-pilot.
