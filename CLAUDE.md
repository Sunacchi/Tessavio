@AGENTS.md

# Claude Code — note specifiche

`AGENTS.md` (importato sopra) è la fonte unica delle regole di progetto. Questa
sezione contiene solo ciò che è specifico di Claude Code.

## Estensioni del repository

| Percorso          | Cosa contiene                                                   | Quando si carica                         |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `.claude/agents/` | profili dei subagenti (equivalenti a `.codex/agents/`)          | quando deleghi                           |
| `.claude/skills/` | procedure ripetibili (`/slice`, `/dod`, `/adr`, `/close-phase`) | on demand                                |
| `<dir>/CLAUDE.md` | una riga che importa l'`AGENTS.md` della directory              | quando leggi un file di quella directory |

I `CLAUDE.md` annidati esistono solo per far caricare a Claude gli `AGENTS.md`
locali, che Codex legge nativamente. Non scriverci regole: vanno nell'`AGENTS.md`
accanto.

## Modo di lavorare

- **Plan mode prima di toccare** `migrations/`, `src/infrastructure/db/schema.ts`
  e `src/security/`: un errore lì è irreversibile o cross-tenant.
- **Esplorazione in subagente.** Per capire come funziona un'area, delega a
  `Explore` o a un profilo read-only invece di leggere dieci file nel contesto
  principale.
- **Review avversariale prima di chiudere.** Dopo una modifica non banale, fai
  rivedere il diff da `quality_reviewer` e — se tocca dati, tenancy o crypto — da
  `data_security_reviewer`, in contesto fresco.
- **Verifica prima di dichiarare fatto.** Esegui il comando più stretto durante
  il lavoro e `npm run validate` alla chiusura, e mostra l'output invece di
  affermare che è verde.
- `/clear` fra task non correlate; `/compact` conservando file modificati e
  comandi di test.
