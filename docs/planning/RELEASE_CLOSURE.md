# Checklist finale di chiusura repository

> Checklist di release e matrice di evidenze. Leggere solo alla chiusura di un gate (I3 core beta oppure O prodotto esteso).

- [ ] tutte le fasi del gate dichiarato (core beta I3 o prodotto esteso O) hanno
      exit criteria verificati; nessuna capability approvata è degradata a idea generica;
- [ ] tutte le feature del gate hanno scenario felice, limite, failure e recovery documentati;
- [ ] zero finding P0/P1 aperti; P2/P3 residui hanno owner e decisione esplicita;
- [ ] format, lint, typecheck, unit, integration, security, property e benchmark smoke verdi;
- [ ] migration riproducibili, forward validate e con recovery provata;
- [ ] lifecycle/purge è implementato e testato per ogni categoria persistita, non
      soltanto approvato come tabella di retention;
- [ ] dipendenze/versioni/compatibility date sono fissate e documentate;
- [ ] README, architettura, ADR, runbook, privacy, backlog e comandi sono aggiornati;
- [ ] installazione, test e build funzionano da clone pulito;
- [ ] nessun secret, dato personale, raw media o artefatto locale è tracciato;
- [ ] export, revoca integrazioni e cancellazione account sono verificati end-to-end;
- [ ] backup/restore, incident response, rollback e ownership operativa sono consegnati;
- [ ] sole integrazioni esterne differite restano nel backlog futuro; i domini
      J-N conservano milestone concrete e non diventano TODO impliciti;
- [ ] scan di documenti, schema, config e dipendenze conferma assenza Open Banking;
- [ ] Google H1-H3 ha mapping, adapter fake, conflict/recovery evidence coerenti con ADR-0011;
- [ ] `CURRENT_MILESTONE.md` registra la chiusura e rimanda al prossimo ciclo prodotto;
- [ ] release notes e matrice requisiti -> test -> evidenze sono pubblicate nel repo;
- [ ] tag/release candidate è creato soltanto dal proprietario o con sua autorizzazione;
- [ ] il main agent consegna un handoff finale con file, comandi, rischi accettati e decisioni.

## Matrice minima di evidenze

| Gate          | Evidenza richiesta                                              |
| ------------- | --------------------------------------------------------------- |
| Funzione      | scenario/acceptance test e messaggio utente osservato           |
| Tenancy       | repository scope esplicito + test cross-user/space negativo     |
| Idempotenza   | chiave/vincolo + retry test nel punto di partial failure        |
| Authorization | policy centralizzata + denial test prima della mutation         |
| Audit/Undo    | before/after redatto + prova apply/revert quando reversibile    |
| Tempo/denaro  | tipi espliciti + edge/property test pertinenti                  |
| AI            | schema/validator/policy test + benchmark/costo/privacy evidence |
| Operatività   | log/metriche redatti + recovery/rollback riprodotto             |
| Release       | comando esatto, esito, commit/tag e rischio residuo             |

Nessun agente può chiudere una fase basandosi soltanto sul proprio handoff. La
firma finale appartiene al main agent, che confronta evidenze, milestone e DoD.
