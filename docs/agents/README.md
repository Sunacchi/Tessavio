# Manuale degli agenti

## Modello operativo

Il main agent possiede requisiti, sequenza della milestone, decisioni trasversali, integrazione finale e comunicazione con l'utente. I subagenti ricevono task indipendenti e bounded; non decidono autonomamente di espandere scope o fase.

I profili Codex sono in `.codex/agents/`:

| Agente                   | Modalità        | Ownership                                              |
| ------------------------ | --------------- | ------------------------------------------------------ |
| `architect`              | read-only       | confini, ADR, coerenza con invarianti e milestone      |
| `cloudflare_worker`      | workspace-write | entrypoint, Telegram transport, Queue, Cron, bindings  |
| `domain_worker`          | workspace-write | dominio deterministico, use case, audit, undo          |
| `data_security_reviewer` | read-only       | D1, tenancy, authorization, crypto, privacy, retention |
| `ai_integrations_worker` | workspace-write | ActionProposal, adapter/router AI, OAuth, benchmark    |
| `quality_reviewer`       | read-only       | test gap, edge case, DoD e regressioni                 |

## Quando delegare

Delegare quando il lavoro è separabile per file e risultato, per esempio:

- una ricognizione read-only mentre il main agent prepara il piano;
- review sicurezza e review qualità in parallelo dopo una modifica;
- implementazioni in moduli disgiunti con contratti già stabiliti.

Non delegare una decisione di prodotto ambigua, una piccola modifica locale o due scritture che toccherebbero gli stessi file. Massimo tre subagenti contemporanei.

## Sequenza consigliata

1. main agent legge milestone e istruzioni;
2. `architect` verifica confini solo se la task è architetturalmente significativa;
3. un singolo writer possiede ciascun insieme di file;
4. reviewer read-only controllano dopo che la modifica è stabile;
5. main agent integra risultati, esegue verifiche finali e aggiorna documenti/ADR.

Il routing Sol/Sonnet/altri modelli e il formato obbligatorio con cui, alla
chiusura di ogni fase, si annunciano fase successiva e modello consigliato sono
definiti nel [master action plan](../planning/MASTER_ACTION_PLAN.md#routing-dei-modelli).

## Contratto di consegna

Ogni agente deve restituire:

- esito in una frase;
- evidenze con file/simboli;
- file modificati oppure dichiarazione `read-only`;
- comandi di verifica ed esito;
- rischi residui o assunzioni;
- eventuale decisione richiesta al main agent.

Usare [TASK_TEMPLATE.md](TASK_TEMPLATE.md) per assegnare il lavoro e [HANDOFF.md](HANDOFF.md) per la consegna.
