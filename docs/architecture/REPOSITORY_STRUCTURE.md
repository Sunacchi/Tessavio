# Struttura del repository

```text
.
|-- AGENTS.md                 # regole di progetto: fonte unica
|-- CLAUDE.md                 # importa AGENTS.md + note Claude Code
|-- .claude/
|   |-- agents/               # profili subagente (Claude)
|   |-- skills/               # procedure ripetibili: slice, dod, adr, close-phase
|   `-- settings.json         # permessi di comando
|-- .codex/
|   |-- config.toml
|   `-- agents/               # stessi profili in formato Codex
|-- src/
|   |-- entrypoints/          # fetch, queue, scheduled
|   |-- telegram/             # transport e presentazione
|   |-- application/          # use case, porte, comandi, policy
|   |-- domains/              # regole pure, AI-independent
|   |-- ai/                   # adapter e router (Phase C+)
|   |-- integrations/         # adapter esterni opzionali
|   |-- infrastructure/       # repository D1, Queue, crypto, clock
|   |-- security/             # authorization, segreti
|   `-- shared/               # contratti, errori, logger, config
|-- migrations/               # migration D1 versionate
|-- tests/                    # unit, integration, security
|-- benchmark/                # dataset e metriche AI (Phase C+)
|-- docs/
|   |-- README.md             # indice con costi di lettura
|   |-- agents/               # manuale, orchestrazione, routing, template
|   |-- architecture/
|   |-- decisions/            # ADR
|   |-- planning/
|   |   `-- phases/           # un piano esecutivo per fase
|   |-- privacy/
|   `-- runbooks/
|-- scripts/
|-- README.md
`-- SECURITY.md
```

Ogni directory con regole specialistiche ha un `AGENTS.md` (letto nativamente da
Codex) e un `CLAUDE.md` di una riga che lo importa (per Claude Code). Le
istruzioni si combinano dalla radice verso la directory corrente e il file più
vicino prevale. Non scrivere regole nei `CLAUDE.md` annidati.

## Regole di dipendenza

```text
entrypoints/telegram -> application -> domains
                              |          ^
                              v          |
                    ports/interfaces ----+
                              |
                              v
             infrastructure/integrations/ai
```

- `domains` non importa Cloudflare, grammY, Hono, Drizzle o SDK di provider.
- `application` dipende da porte e tipi di dominio, non da dettagli HTTP.
- gli adapter esterni traducono gli errori nella tassonomia condivisa e non
  espongono payload sensibili verso l'interno.
- `security` è invocato dal livello applicativo **prima** di repository o mutation.
- i test unitari seguono i moduli; integration e security vivono nelle directory
  dedicate.

## Budget dei moduli

Fissati in [ADR-0022](../decisions/0022-module-structure-budgets.md).

| Regola                                 | Soglia      |
| -------------------------------------- | ----------- |
| motivazione richiesta nel PR           | > 500 righe |
| split obbligatorio prima di aggiungere | > 800 righe |

- porte nuove in `application/ports/<slice>.ts`, non in un barrel condiviso;
- parser di comandi nuovi in `application/commands/<dominio>.ts`;
- tabelle nuove in `infrastructure/db/schema/<dominio>.ts`;
- nessuna dipendenza opzionale nei contenitori di use case: serve un registry.
