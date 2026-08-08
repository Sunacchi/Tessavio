# Template task per subagente

```md
## Obiettivo

Un risultato verificabile, espresso in una frase.

## Identità e ownership

- task ID e milestone attiva;
- profilo owner;
- dipendenze già completate;
- file/directory posseduti in esclusiva;
- aree condivise che richiedono coordinamento.

Il writer non è solo nel repository: preserva le modifiche altrui, non esegue
revert di file non posseduti e segnala ogni sovrapposizione prima di editare.

## Contesto obbligatorio

- milestone corrente;
- invarianti rilevanti;
- file o moduli in scope;
- contratto già deciso.

## In scope

- attività concrete consentite.

## Out of scope

- aree da non modificare;
- decisioni riservate al main agent;
- deploy, segreti o risorse remote non autorizzati.

## Contratti già decisi

- input/output e tassonomia errori;
- `UserScope`/`SpaceScope` e capability richiesta;
- idempotency/effect key e semantica retry;
- audit, Undo, retention e redaction applicabili;
- porte o schema che il subagente non può ridisegnare.

## Failure model

| Scenario                         | Pending / Pass / N/A | Evidenza o motivazione N/A |
| -------------------------------- | -------------------- | -------------------------- |
| duplicate/retry                  |                      |                            |
| partial failure e crash boundary |                      |                            |
| authorization/cross-tenant       |                      |                            |
| timezone/DST/date-only           |                      |                            |
| money arithmetic                 |                      |                            |
| AI/provider unavailable          |                      |                            |
| privacy/log redaction            |                      |                            |
| recovery/replay                  |                      |                            |

## Acceptance scenarios

- [ ] caso normale Given/When/Then;
- [ ] caso limite;
- [ ] scenario negativo;
- [ ] recovery o replay sicuro.

## Observability e recovery

- event/outcome code e campi log consentiti;
- metriche e correlation propagation;
- metodo per diagnosticare lo scenario senza dati personali;
- trigger, rollback/roll-forward e invarianti post-recovery.

## Output richiesto

- file/evidenze;
- test o verifiche;
- rischi e assunzioni;
- decisioni concrete richieste al main agent, oppure “nessuna”;
- formato della sintesi.

## Test ed evidenze

- comandi esatti per unit/integration/security/property/regression/fault injection;
- fixture, fake clock/ID o provider mock richiesti;
- evidenza attesa per ogni acceptance scenario.

## DoD applicability

| ID  | Gate                                              | Pending / Pass / N/A | Evidenza o motivazione N/A |
| --- | ------------------------------------------------- | -------------------- | -------------------------- |
| F-1 | comportamento normale e casi limite               |                      |                            |
| F-2 | input ambiguo e messaggio utente sicuro           |                      |                            |
| F-3 | fallback deterministico e scope privato/condiviso |                      |                            |
| T-1 | timezone/date relative/DST/date-only              |                      |                            |
| T-2 | denaro in unità minori intere                     |                      |                            |
| S-1 | owner/space scope e authorization                 |                      |                            |
| S-2 | idempotenza e duplicate handling                  |                      |                            |
| S-3 | audit before/after e correlation ID               |                      |                            |
| S-4 | Undo applicabile, user-bound e replay-safe        |                      |                            |
| S-5 | redaction, retention e cancellazione              |                      |                            |
| A-1 | schema strict, validation e nessun DB access AI   |                      |                            |
| A-2 | context minimization, privacy, budget e fallback  |                      |                            |
| A-3 | benchmark aggiornato                              |                      |                            |
| Q-1 | unit e integration test                           |                      |                            |
| Q-2 | security negative test                            |                      |                            |
| Q-3 | property/regression/fault-injection test          |                      |                            |
| Q-4 | format, lint, typecheck e suite pertinenti        |                      |                            |
| Q-5 | migration e backward compatibility                |                      |                            |
| Q-6 | documentazione e ADR                              |                      |                            |
| O-1 | log/metriche diagnostiche e retry classification  |                      |                            |
| O-2 | rollback/recovery                                 |                      |                            |
| O-3 | limiti e dipendenze versionati                    |                      |                            |

## Done when

- criteri osservabili e bounded;
- nessuna task indefinita come “migliora tutto”;
- acceptance, test, osservabilità e recovery applicabili completati;
- matrice DoD senza righe `Pending` e ogni `N/A` motivato;
- zero finding P0/P1 aperti nello scope della task.
```
