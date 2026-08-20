# Runbook

> Procedure operative. Ogni runbook documenta comandi e diagnosi: **nessuno
> autorizza deploy, provisioning o query remote.** Quell'autorizzazione è del
> proprietario del repository.

## Quale aprire

| Situazione                                                    | Runbook                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| configurare l'ambiente locale, sapere quali comandi eseguire  | [DEVELOPMENT](DEVELOPMENT.md)                                         |
| creare o migrare D1 e Queue                                   | [D1_PROVISIONING](D1_PROVISIONING.md)                                 |
| inbox bloccato, job poison, retry storm, DLQ, reply ambigua   | [A1_RECOVERY](A1_RECOVERY.md)                                         |
| preferenze utente: rollout, diagnosi, retention               | [B1_PREFERENCES_RECOVERY](B1_PREFERENCES_RECOVERY.md)                 |
| eventi one-off: contratto comandi, migration, probe temporali | [B1_EVENTS_RECOVERY](B1_EVENTS_RECOVERY.md)                           |
| reminder non consegnati, duplicati, quiet hours, ledger       | [B2_REMINDERS_RECOVERY](B2_REMINDERS_RECOVERY.md)                     |
| task: migration, failure, rollback                            | [B3_TASKS_RECOVERY](B3_TASKS_RECOVERY.md)                             |
| lavoro: turni, consuntivi, pause, report                      | [B4_WORK_RECOVERY](B4_WORK_RECOVERY.md)                               |
| finanze: movimenti, totali per valuta, soft delete            | [B5_FINANCE_RECOVERY](B5_FINANCE_RECOVERY.md)                         |
| liste, item e note                                            | [B6_LISTS_NOTES_RECOVERY](B6_LISTS_NOTES_RECOVERY.md)                 |
| ricorrenze reminder daily/weekly non generate o duplicate     | [B6_REMINDER_RECURRENCE_RECOVERY](B6_REMINDER_RECURRENCE_RECOVERY.md) |
| report e CSV                                                  | [B7_REPORTS_RECOVERY](B7_REPORTS_RECOVERY.md)                         |
| proposte AI: job bloccati, output non valido, conferme        | [C1_PROPOSALS_RECOVERY](C1_PROPOSALS_RECOVERY.md)                     |
| OAuth BYOK, credenziali cifrate, budget e rotazione KEK       | [C2_OAUTH_RECOVERY](C2_OAUTH_RECOVERY.md)                             |
| riprodurre il gate di chiusura Phase B                        | [PHASE_B_CLOSURE](PHASE_B_CLOSURE.md)                                 |
| capacità D1, DLQ, residenza e DPIA prima del pilot            | [PRE_PILOT_OPERATIONS](PRE_PILOT_OPERATIONS.md)                       |

## Regole comuni a tutti i runbook

- **Diagnosi redatta.** Nei ticket, nei log e nelle console condivise usare solo
  ID interni, correlation ID, stato/versione e codici di esito. Mai testo
  utente, titoli, importi, `envelope_json`, secret o token Undo.
- **Scope esplicito.** Ogni query di diagnosi include l'owner: una verifica non
  è un'eccezione alla multi-tenancy.
- **Rollback prima del rollout.** Una migration si applica solo se il percorso di
  ritorno è già scritto in questo runbook.
- **Query plan.** Prima di un gate, `EXPLAIN QUERY PLAN` sulle query hot toccate.

## Struttura di un runbook nuovo

Una nuova slice aggiunge il suo runbook con queste sezioni, nell'ordine:
`Scope` · `Rollout locale/staging` · `Diagnosi senza contenuto personale` ·
`Failure e recovery` · `Rollback` · `Query plan obbligatori`.
