# Manuale degli agenti

## Modello operativo

Il main agent possiede requisiti, sequenza della milestone, decisioni
trasversali, ADR, integrazione finale e comunicazione con l'utente. I subagenti
ricevono task indipendenti e bounded: non decidono di espandere scope o fase, non
aggiungono dipendenze e non creano risorse remote.

## Profili

Stessi ruoli in due formati: `.claude/agents/*.md` per Claude Code,
`.codex/agents/*.toml` per Codex. Le regole di progetto restano in `AGENTS.md`;
i profili definiscono solo ruolo, permessi e priorità di analisi.

| Ruolo                    | Modalità  | Ownership                                               | Non fa                              |
| ------------------------ | --------- | ------------------------------------------------------- | ----------------------------------- |
| `architect`              | read-only | confini, ADR, coerenza con invarianti e milestone       | implementazione                     |
| `cloudflare-worker`      | write     | entrypoint, transport Telegram, Queue, Cron, binding    | regole di dominio, deploy           |
| `domain-worker`          | write     | dominio deterministico, use case, audit, Undo           | SDK di provider, infrastruttura AI  |
| `ai-integrations-worker` | write     | `ActionProposal`, adapter e router AI, OAuth, benchmark | authorization finale, write dirette |
| `data-security-reviewer` | read-only | D1, tenancy, authorization, crypto, privacy, retention  | modificare file                     |
| `quality-reviewer`       | read-only | gap nei test, edge case, DoD, regressioni               | modificare file                     |

## Quando delegare

Delega quando il lavoro è separabile per file **e** per risultato:

- una ricognizione read-only mentre il main agent prepara il piano;
- review di sicurezza e di qualità in parallelo, dopo che la modifica è stabile;
- implementazioni in moduli disgiunti con contratti già congelati.

Non delegare: una decisione di prodotto ambigua, una modifica locale di poche
righe, due scritture che toccherebbero gli stessi file. **Massimo tre subagenti
contemporanei.**

## Sequenza consigliata

1. il main agent legge milestone e istruzioni;
2. `architect` interviene solo se la task è architetturalmente significativa;
3. un solo writer possiede ciascun insieme di file;
4. i reviewer read-only controllano dopo che la modifica è stabile;
5. il main agent integra, riesegue i gate e aggiorna documenti e ADR.

Il _come_ condurre la task è in [ORCHESTRATION.md](ORCHESTRATION.md); il _quale
modello_ in [MODEL_ROUTING.md](MODEL_ROUTING.md).

## Contratto di consegna

Ogni agente restituisce: esito in una frase; evidenze con file e simbolo; file
modificati oppure `read-only`; comandi di verifica ed esito; rischi residui o
assunzioni; eventuale decisione richiesta al main agent.

Usa [TASK_TEMPLATE.md](TASK_TEMPLATE.md) per assegnare e
[HANDOFF.md](HANDOFF.md) per consegnare.
