# B6.2 — Recovery delle ricorrenze reminder

## Scopo

Questo runbook copre le tabelle `reminder_recurrences`,
`reminder_recurrence_occurrences` e `reminder_recurrence_undo_actions`. Le
occorrenze materializzate sono normali righe `reminders` e seguono il runbook B2
per claim, Queue e delivery.

## Segnali da osservare

- regole `active` con `next_due_at_utc` nel passato per più cicli Cron;
- crescita di `reminder.recurrence_generated` senza corrispondenti reminder;
- errori di constraint sullo slot `(user_id, recurrence_id, scheduled_local)`;
- occorrenze duplicate, che indicano una violazione del CAS/dedupe;
- Queue lag o reminder `claimed` bloccati, gestiti dal recovery B2.

I log contengono soltanto evento e conteggio; testo, timezone e snapshot non
devono essere loggati.

## Verifica scoped

Usare sempre owner e ID insieme:

```sql
SELECT id, frequency, local_time, time_zone, next_local_date,
       next_due_at_utc, status, version
FROM reminder_recurrences
WHERE user_id = ? AND id = ?;

SELECT reminder_id, scheduled_local, due_at_utc, source
FROM reminder_recurrence_occurrences
WHERE user_id = ? AND recurrence_id = ?
ORDER BY due_at_utc DESC LIMIT 50;
```

Non includere `text` o snapshot audit nei log o nei ticket operativi.

## Recovery

1. Se la regola è dovuta ma non esiste mapping per lo slot, lasciare che il Cron
   successivo ripeta la generazione; la mutation CAS è idempotente.
2. Se mapping e reminder esistono, non reinserire nulla: il Cron B2 reclamerà il
   reminder pending o recupererà il claim stabile.
3. Se la regola è avanzata ma mapping/reminder mancano, trattare la situazione
   come inconsistenza atomica D1: sospendere il deploy e ripristinare tramite D1
   Time Travel o backup, non costruire SQL ad hoc non scoped.
4. Una regola cancellata non va riattivata operativamente. Usare Undo ancora
   valido oppure un nuovo comando utente.
5. Non ricreare gli slot coalesced: il contratto B6.2 non esegue backfill.

## Rollback migration

La migration B6.2 è additiva. Il rollback applicativo consiste nel distribuire
il codice precedente lasciando inattive le nuove tabelle; prima di rimuoverle
esportare D1 e verificare che non esistano regole attive. Non eliminare reminder
già materializzati: sono record B2 autonomi e auditabili.

Nessun comando di questo runbook va eseguito sul database remoto senza backup,
change approval e identificazione esplicita dell'ambiente.
