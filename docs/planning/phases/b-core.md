# Phase B — Core Product, interamente deterministica

> Stato: **completata** (2026-08-19). Archivio storico. Contratto congelato in [ADR-0021](../../decisions/0021-phase-b-closure.md).

## Gate di ingresso e preparazione just-in-time

- [x] A1 completata senza finding critici e posizione A2/B2 decisa;
- [x] attivare una sola vertical slice B alla volta: B1-B5 il 2026-08-08,
      B6.1, B6.2 e B7 il 2026-08-19;
- [x] scrivere scenari utente normali, ambigui, duplicate, unauthorized e Undo;
- [x] definire modello dati minimo, porte e policy prima degli adapter;
- [x] decidere per ogni entità private-by-default e futura condivisione esplicita;
- [x] introdurre Temporal/recurrence solo quando la slice lo richiede davvero;
- [x] aggiornare milestone e backlog senza generare scaffold delle slice successive.

## Sequenza di valore

- [x] **B1 Preferenze + agenda one-off.** Lingua, timezone IANA, formato ora,
      valuta/privacy, eventi one-off, date-only vs instant e viste `/oggi`/`/domani`;
      nessun default temporale inventato.
- [x] **B2 Reminder end-to-end.** Creazione/query esplicite, state machine,
      leased claim, delivery ledger, retry/recovery, timezone/DST e infrastruttura A2.
- [x] **B3 Task.** Inbox task, scadenze date-only o temporali, stato/priorità
      espliciti, completamento idempotente, riapertura e Undo.
- [x] **B4 Lavoro.** Turni pianificati separati dai consuntivi, pause e regole
      data-driven; attraversamento mezzanotte e report verificabili.
- [x] **B5 Finanze base.** Spese/entrate, minor unit, valuta, data, categoria,
      esercente/note/metodo facoltativi, correzione/delete/Undo e totali senza `float`.
- [x] **B6.1 Liste e note private.** Liste private, item e note standalone con
      version check, audit/Undo e nessuna eliminazione bulk implicita.
- [x] **B6.2 Ricorrenza minima.** Reminder daily/weekly con ora locale/timezone,
      generazione one-off idempotente, coalescing, CAS e property test DST.
- [x] **B7 Report base.** Query deterministiche per agenda, task, lavoro e spese;
      periodi/timezone espliciti, provenance dei totali, CSV export base e zero dipendenza AI.

## UX e criteri di uscita B

- [x] ogni feature è utilizzabile tramite comandi/scorciatoie documentate;
- [x] `/oggi` produce una vista coerente di eventi, task, turni e reminder;
- [x] input mancanti non vengono inferiti silenziosamente;
- [x] azioni semplici eseguono con Undo; nessuna mutation bulk è attiva in B;
- [x] ogni mutation path supera idempotency, audit, authorization e negative test;
- [x] audit e mutation sono atomici o coordinati durevolmente; Undo è user/scope-bound,
      single-use, con TTL/version check e test cross-user, replay e stale resource;
- [x] retention/purge delle categorie B usa fake clock, è idempotente e non attraversa tenant;
- [x] tempo/denaro/recurrence applicano i property test pertinenti;
- [x] report e viste non leggono dati di altri utenti;
- [x] il prodotto B supera una demo completa con provider AI assente.

Agent route per ogni slice: `architect` solo al kickoff se cambia contratto;
`domain_worker` è il writer principale; `cloudflare_worker` aggiunge presentazione
Telegram/adapter dopo il contratto; reviewer read-only chiudono la slice.
