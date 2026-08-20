# B7 — Recovery dei report base

Questo runbook copre i report read-only e il documento CSV B7. Non autorizza
provisioning, deploy remoto o ricostruzione di dati fuori dai domini sorgente.

## Sintomi e diagnosi

- **Report troppo esteso:** almeno uno tra agenda, task, lavoro o finanze supera
  500 contributori. Restringere il periodo; non aumentare il limite in emergenza
  e non restituire totali parziali.
- **Totale inatteso:** verificare timezone profilo, date civili inclusive,
  formula `base-report-v1`, `work-report-v1`, stato dei record e ID contributor.
  Non ricalcolare lavoro con regole correnti al posto degli snapshot storici.
- **CSV rifiutato:** verificare il limite 5 MB e il tipo documento. Il contenuto
  non viene conservato: rigenerarlo dallo stesso periodo e dallo stesso scope.
- **Invio Telegram incerto:** ispezionare il delivery ledger tramite job e
  correlation ID. Una delivery `ambiguous` non va reinviata automaticamente;
  una failure certamente temporanea conserva envelope e idempotency key.
- **Sospetto leakage:** interrompere il rollout, verificare che ogni query abbia
  `user_id = ?`, eseguire i test security B7 e trattare qualunque esposizione
  cross-tenant come P0/P1.

I log ammessi contengono soltanto correlation/job ID, stato, latenza e codice di
errore. Non registrare CSV, titolo evento/task, categoria, esercente, note o ID
Telegram come contenuto diagnostico.

## Query plan

Le letture agenda usano gli indici scope/status/date o scope/status/instant; le
task eseguono rami separati per stato così gli indici scope/status restano
utilizzabili; finanze usa `finance_entries_scope_date_idx`; lavoro riusa gli
indici temporali B4. Prima del pilot rieseguire `EXPLAIN QUERY PLAN` sulle query
esatte con distribuzioni realistiche.

## Rollback

B7 non modifica lo schema. Il rollback applicativo rimuove routing e
presentazione `/report` e ripristina il bundle precedente. Non eliminare né
trasformare dati sorgente: eventi, task, lavoro e finanze restano leggibili dai
comandi dei rispettivi domini. I documenti CSV sono transitori e non richiedono
purge o recovery storage.
