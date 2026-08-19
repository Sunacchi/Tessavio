# ADR-0022 — Budget dei moduli e struttura per slice

Stato: accepted
Data: 2026-08-19

## Contesto

Alla chiusura della Phase B alcuni file crescono linearmente con il numero di
slice invece che con la complessità del problema. Misurazioni al 2026-08-19:

| File                                       | Righe | Cosa contiene                               |
| ------------------------------------------ | ----- | ------------------------------------------- |
| `src/infrastructure/db/list-repository.ts` | 1256  | liste, item e note in un unico adapter      |
| `src/infrastructure/db/schema.ts`          | 1156  | tutte le tabelle di tutti i domini          |
| `src/application/deterministic-command.ts` | 922   | i parser di **tutti** i comandi Telegram    |
| `src/infrastructure/db/work-repository.ts` | 913   | regole, turni, consuntivi e pause           |
| `src/application/ports.ts`                 | 870   | ~45 interfacce e tipi di **tutte** le slice |

Tre conseguenze concrete:

1. **Costo di contesto.** Un agente che aggiunge un comando apre `ports.ts` e
   `deterministic-command.ts` per intero, cioè ~1800 righe, per toccarne 40.
   Lo stesso vale per una persona in review.
2. **Accoppiamento accidentale.** `process-inbound.ts` importa tredici porte da
   un unico modulo e dichiara quattro dipendenze opzionali
   (`finance?`, `lists?`, `recurrences?`, `work?`): il contenitore di use case
   conosce ogni slice esistente, e ogni nuova slice lo modifica.
3. **Crescita non delimitata.** Nessuno dei file sopra ha un punto naturale di
   arresto: la slice B8 li allungherebbe tutti senza che nulla lo segnali.

La struttura per tipo tecnico (`domains/`, `application/`, `infrastructure/`)
resta corretta per la direzione delle dipendenze: il problema non è il layering,
è che ogni layer ha un file condiviso che aggrega tutte le slice.

## Decisione

Nessun big-bang refactor. Si fissano budget e regole che valgono **dalla
prossima slice**, e i file esistenti si riducono in modo opportunistico quando
vengono comunque toccati.

- **Budget di file.** Oltre 500 righe serve una motivazione esplicita nel PR.
  Oltre 800 righe il file va splittato **prima** di aggiungere altro.
- **Porte per slice.** Le porte nuove vivono in
  `src/application/ports/<slice>.ts`; `ports.ts` diventa un re-export di
  compatibilità e non riceve nuove definizioni.
- **Parser per dominio.** Un comando nuovo aggiunge
  `src/application/commands/<dominio>.ts` con la sua funzione di parsing e si
  registra in una mappa; `deterministic-command.ts` conserva solo dispatch e
  tipi condivisi.
- **Niente dipendenze opzionali.** Un `foo?:` in un contenitore di use case va
  sostituito da un registry di handler: la slice si registra, il contenitore non
  la nomina.
- **Repository per aggregato.** Un adapter che copre più di un aggregato
  (liste + item + note) si separa quando supera il budget, estraendo prima i row
  mapper e le query di Undo.
- **Schema per dominio.** Le tabelle nuove vanno in
  `src/infrastructure/db/schema/<dominio>.ts`, con `schema.ts` come barrel.

## Conseguenze

- Il costo di contesto di una slice diventa proporzionale alla slice, non alla
  storia del repository.
- La direzione delle dipendenze di `REPOSITORY_STRUCTURE.md` resta invariata:
  cambia la granularità dei file, non i layer.
- Rimane un periodo misto in cui `ports.ts` e `deterministic-command.ts`
  contengono ancora le slice B: è accettato, purché non crescano.
- Il budget è una regola di review, non un lint: va verificato nel gate di
  qualità finché non esiste una regola automatica.

## Condizioni di riesame

Riesaminare se un file rispetta il budget ma richiede comunque più di tre
aperture per una modifica tipica, oppure se il numero di file per slice diventa
esso stesso un costo di navigazione superiore al beneficio.
