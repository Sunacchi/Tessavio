# Orchestrazione degli agenti

> Come il main agent conduce una task dall'outcome al commit. Il _chi fa cosa_
> è in [README.md](README.md); il _cosa consegnare_ in [HANDOFF.md](HANDOFF.md);
> il _quale modello_ in [MODEL_ROUTING.md](MODEL_ROUTING.md).

## Loop per ogni task

- [ ] il main agent legge `AGENTS.md`, milestone, DoD e istruzioni locali;
- [ ] seleziona il primo outcome non completato della sola milestone attiva;
- [ ] trasforma l'outcome in una task bounded usando
      [TASK_TEMPLATE.md](TASK_TEMPLATE.md);
- [ ] dichiara file/aree di ownership ed evita writer concorrenti sugli stessi file;
- [ ] riserva a sé requisiti, contratti cross-layer, decisioni di prodotto e ADR;
- [ ] usa al massimo tre subagenti simultanei e solo per lavoro indipendente;
- [ ] fa eseguire al writer i test mirati prima dell'handoff;
- [ ] dopo una modifica stabile richiede review read-only di qualità e, quando
      tocca dati/sicurezza, review avversariale dedicata;
- [ ] integra i finding, riesegue i gate completi e controlla il diff finale;
- [ ] aggiorna test, documenti, backlog, milestone e ADR nello stesso ciclo;
- [ ] per ogni schema change prova fresh/upgrade, compatibilità worker N-1/schema N,
      vincoli tenant, rollback/roll-forward e recovery dei dati cifrati/audit;
- [ ] produce un handoff conforme a [HANDOFF.md](HANDOFF.md);
- [ ] crea un commit atomico solo quando la slice è verde e lo scope è verificato.

## Scelta dell'agente

| Profilo                  | Assegnare quando                                            | Non delegare                 |
| ------------------------ | ----------------------------------------------------------- | ---------------------------- |
| `architect`              | confini, ADR, nuova milestone, contratti fra moduli         | implementazione              |
| `cloudflare_worker`      | `fetch`, `queue`, `scheduled`, bindings, Telegram transport | regole di dominio            |
| `domain_worker`          | use case deterministici, policy, audit, undo                | SDK/provider e deploy        |
| `ai_integrations_worker` | Phase C+, schema AI, router, OAuth, benchmark               | authorization finale o write |
| `data_security_reviewer` | schema, migration, tenancy, OAuth, crypto, privacy          | modifica file                |
| `quality_reviewer`       | DoD, edge case, retry, regressioni e release gate           | modifica file                |

Sonnet può essere usato come writer per le task delimitate; la qualità dipende
più dal brief che dal nome del modello. Ogni brief deve includere obiettivo
osservabile, file posseduti, invarianti rilevanti, out-of-scope, test richiesti e
condizione di arresto. Un agente non decide autonomamente di aprire la fase
successiva, aggiungere una dipendenza o creare risorse remote.

## Protocollo obbligatorio di chiusura fase

Alla chiusura di ogni fase il main agent deve consegnare, anche quando l'utente
non lo richiede nuovamente:

```md
## Chiusura <fase>

- Esito: completata | non chiudibile
- Evidenze: test, migration, review, recovery e documenti
- Rischi residui: finding con owner oppure nessuno

## Prossimo passo

- Fase successiva: <ID e titolo>
- Modello primario consigliato: Sol | Sonnet | altro
- Modelli/agenti di supporto: <ruoli bounded>
- Perché: <rischio e tipo di lavoro in 1-3 frasi>
- Prima task: <obiettivo pronto da assegnare>
- Gate prima di partire: <decisioni o prerequisiti>
```

- [ ] non annunciare la fase successiva come attiva se il gate corrente non è verde;
- [ ] se la fase non è chiudibile, indicare Sol come orchestratore del recupero e
      Sonnet soltanto per eventuali fix già delimitati;
- [ ] aggiornare `CURRENT_MILESTONE.md` solo dopo la firma del gate;
- [ ] rivalutare il modello consigliato se lo scope della fase successiva cambia.

## Prompt base per un agente di coding

```text
Ruolo: <profilo>. Milestone attiva: <id e link>.
Obiettivo bounded: <un risultato osservabile>.
Ownership esclusiva: <directory/file>. Non sei solo nel repository: conserva le
modifiche altrui e segnala sovrapposizioni prima di editare.

Leggi AGENTS.md, i quattro documenti obbligatori e l'AGENTS.md più vicino.
Contratti già decisi: <input/output/errori/idempotency/scope>.
In scope: <azioni concrete>. Out of scope: <fasi/moduli/deploy/dipendenze>.
Test obbligatori: <unit/integration/security/property/regression>.
Done when: <criteri verificabili>.

Non cambiare architettura o scope per sbloccare il task: restituisci una decisione
richiesta al main agent. Consegna usando docs/agents/HANDOFF.md, elencando tutti i
file toccati, comandi eseguiti, rischi residui e assunzioni.
```

## Codex nativo

Gli agenti custom sono definiti in `.codex/agents/`, i loro equivalenti Claude in
`.claude/agents/`. Entrambi gli strumenti combinano le istruzioni dalla radice
verso la directory corrente e il file più vicino prevale: tenere il file root
sotto le ~150 righe e spostare i dettagli specialistici nei file annidati.

Esempio di richiesta:

```text
Implementa la vertical slice <id>. Delega a cloudflare_worker il transport,
a domain_worker il caso d'uso deterministico e a data_security_reviewer una review
read-only dopo le modifiche. Evita scritture concorrenti sugli stessi file, attendi
tutti e integra i risultati contro la Definition of Done.
```

## Ruflo (dev-only)

Ruflo non fa parte del bot. Un'eventuale configurazione deve: usare l'adapter
Codex; restare minima e project-scoped; fissare ogni versione esattamente dopo
verifica; persistere lo stato del loop in un percorso locale esplicito; definire
iterazioni massime, timeout e condizioni di successo/fallimento; evitare template
`full` e tool non necessari; non leggere o propagare segreti.

Non creare la configurazione finché una task non richiede il loop. Registrare
allora comandi, versioni e rollback in un runbook.

## Graphify (dev-only)

Prima esecuzione consentita: dopo `A1 Foundation vertical slice`. Esecuzioni
successive: fine milestone o refactor sostanziale. Salvare solo output utili alla
decisione; non aggiungerlo al normale test loop.
