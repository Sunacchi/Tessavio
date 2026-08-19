# Template task per subagente

> Copiare e compilare per assegnare lavoro. Un campo lasciato vuoto è una
> decisione non presa: risolverla prima di delegare, non durante.

```md
## Obiettivo

Un risultato verificabile, espresso in una frase.

## Identità e ownership

- task ID e milestone attiva;
- profilo owner (`.claude/agents/` o `.codex/agents/`);
- dipendenze già completate;
- file/directory posseduti in esclusiva;
- aree condivise che richiedono coordinamento.

Il writer non è solo nel repository: preserva le modifiche altrui, non esegue
revert di file non posseduti e segnala ogni sovrapposizione prima di editare.

## Contesto obbligatorio

- milestone corrente;
- invarianti rilevanti (numero della voce in `AGENTS.md`, non il testo copiato);
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

## Test ed evidenze

- comandi esatti per unit/integration/security/property/regression/fault injection;
- fixture, fake clock/ID o provider mock richiesti;
- evidenza attesa per ogni acceptance scenario.

## Gate DoD applicabili

Compilare la matrice della Definition of Done sul diff reale: una riga per
gate applicabile, con `Pass`/`Pending`/`N/A` ed evidenza. `N/A` senza
motivazione conta come `Pending`.

Fonte dei gate: `docs/planning/DEFINITION_OF_DONE.md` — non ricopiarli qui.
Con Claude Code la compilazione è automatizzata dalla skill `/dod`.

## Output richiesto

- file/evidenze;
- test o verifiche eseguite, con comando ed esito;
- rischi e assunzioni;
- decisioni concrete richieste al main agent, oppure "nessuna";
- sintesi secondo `docs/agents/HANDOFF.md`.

## Done when

- criteri osservabili e bounded;
- nessuna task indefinita come "migliora tutto";
- acceptance, test, osservabilità e recovery applicabili completati;
- matrice DoD senza righe `Pending` e ogni `N/A` motivato;
- zero finding P0/P1 aperti nello scope della task.
```
