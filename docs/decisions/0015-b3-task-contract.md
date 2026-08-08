# ADR-0015 — B3 task private, scadenze tipizzate e state machine

- Status: accepted
- Date: 2026-08-08

## Context

B3 deve introdurre task utili senza AI, planner, ricorrenze o condivisione. Una
scadenza che indica soltanto un giorno non ha la stessa semantica di un istante:
convertirla arbitrariamente a mezzanotte perderebbe l'intento e produrrebbe
errori in timezone e DST. Complete, reopen e retry Queue devono convergere senza
duplicare mutation, audit o Undo.

## Decision

Ogni task B3 è privata e user-scoped. Conserva titolo, priorità esplicita
`low|medium|high`, stato `open|completed`, versione e una scadenza discriminata:

- `none`: nessuna scadenza e nessun dato temporale;
- `date_only`: `due_date_local` ISO senza timezone o instant inventato;
- `instant`: `due_at_utc` più timezone IANA originale.

Il comando deterministico è:

```text
/task crea <nessuna|YYYY-MM-DD|YYYY-MM-DDTHH:mm> | <bassa|media|alta> | Titolo
/task leggi <id>
/task lista
/task completa <id>
/task riapri <id>
```

Le ore civili locali vengono risolte con il solo polyfill Temporal già fissato;
gap e fold DST sono rifiutati, mai disambiguati implicitamente. A differenza dei
reminder, una task può avere una scadenza passata perché rappresenta anche lavoro
arretrato esplicitamente inserito dall'utente.

La state machine è `open <-> completed`. Complete su `completed` e reopen su
`open` sono no-op espliciti. Create, complete e reopen sono autorizzate prima
della persistenza, idempotenti per chiave, auditabili e atomiche in un batch D1.
Producono Undo `tsk_` user-bound, single-use, con TTL di 15 minuti e version
check. L'Undo della create elimina la task; gli altri ripristinano lo stato
precedente aumentando la versione.

`/task lista` mostra al massimo 50 task aperte in ordine deterministico:
priorità alta/media/bassa, scadenze date-only/instant/assenti, valore di scadenza,
creazione e ID. `/oggi` e `/domani` aggregano eventi e task aperte in scadenza;
la finestra civile deriva dal timestamp Telegram e dalla timezone utente.

Task completate e aperte restano conservate fino alla cancellazione account in
B3, così reopen e future viste possono funzionare. I record Undo scaduti vengono
eliminati in batch bounded e user-scoped. Non viene introdotto soft delete perché
B3 non espone delete/cancel della task.

## Consequences

- D1 resta autorevole e il dominio task funziona senza AI o provider esterni;
- date-only e instant non vengono confrontati fingendo che condividano lo stesso
  tipo temporale;
- il modello è private-by-default e non anticipa `SpaceScope` o assegnazioni;
- B3 non include modifica titolo/scadenza/priorità, subtasks, planner,
  ricorrenze, reminder collegati o Google Tasks;
- le hot query richiedono indici separati per stato, giorno locale, instant e
  purge Undo.

## Revisit when

B6 introduce ricorrenze, E1 introduce passi/durate, E2 introduce slot del
planner oppure F2 introduce task condivise e assegnazioni con `SpaceScope`.
