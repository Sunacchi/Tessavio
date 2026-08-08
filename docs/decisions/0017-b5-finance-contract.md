# ADR-0017 — B5 finanze: registro privato, minor unit e Undo versionato

- Status: accepted
- Date: 2026-08-08

## Context

B5 deve registrare spese ed entrate manuali senza AI, sommare importi senza
`float`, consentire correzione/eliminazione e preservare isolamento, audit,
idempotenza e Undo. La slice non deve anticipare budget, ricorrenze, forecast,
CSV, spese condivise o qualunque forma di Open Banking.

Valute diverse non sono sommabili senza un tasso e una provenance di cambio che
B5 non possiede. Anche l'interpretazione dei decimali dipende dall'esponente
della valuta; affidarla implicitamente al runtime renderebbe il comando meno
riproducibile.

## Decision

- un'unica entità privata `finance_entry` distingue `expense|income`; la
  direzione non è codificata nel segno e `amount_minor` è sempre un intero
  positivo compreso tra 1 e 2.147.483.647;
- il comando accetta esplicitamente l'importo già espresso in unità minori. La
  valuta è un codice maiuscolo di tre lettere e non viene convertita;
- la data economica è un giorno civile `YYYY-MM-DD`, non un timestamp o un
  offset; categoria è obbligatoria, esercente, metodo e note sono facoltativi;
- la provenance B5 è `manual_command`. Nessuna estrazione AI o da documento può
  scrivere questa tabella prima delle rispettive milestone;
- correzione ed eliminazione richiedono la versione letta dall'utente. La
  cancellazione è soft durante il normale lifecycle; i record eliminati non
  partecipano a letture, liste o totali;
- ogni mutation è atomica con audit e token `fin_…` single-use di 15 minuti.
  Undo della create rimuove la riga, Undo di correzione/delete ripristina la
  snapshot precedente con una nuova versione; versioni stale non vengono
  forzate;
- liste e totali usano periodi civili inclusivi di massimo 366 giorni. I totali
  sono separati per valuta e direzione; SQLite espone le somme come testo e
  l'applicazione usa `bigint` per il netto, evitando conversioni floating point;
- ogni query economica include `UserScope`. Contenuti economici e snapshot
  audit non entrano nei log; dati e audit restano fino alla cancellazione
  account, mentre gli Undo scaduti hanno purge bounded user-scoped.

## Consequences

- il contratto è riproducibile e non dipende da CLDR, tassi di cambio o provider;
- l'utente vede sempre unità minori, valuta, provenance e versione; una futura UI
  potrà presentare unità maggiori conoscendo esplicitamente l'esponente valuta;
- categorie sono testo modificabile sul movimento, non entità/regole autonome;
- `finance_entries` e `finance_undo_actions` sono le sole tabelle B5. Non
  esistono conti, saldi bancari, credenziali, provider, polling o pagamenti;
- forecast, consulenza, conversione valuta, split, import/export e ricorrenze
  restano fuori scope.

## Revisit conditions

Rivedere il contratto soltanto se una milestone autorizza una UI con catalogo
valute versionato, import CSV manuale, split o finanze condivise. Open Banking
richiede una decisione di prodotto che supersede ADR-0009 e non è una normale
estensione di questo schema.
