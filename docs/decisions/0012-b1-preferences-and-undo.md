# ADR-0012 — Preferenze B1.1 e Undo versionato

- **Stato:** accepted
- **Data:** 2026-08-08

## Contesto

B1.1 introduce il primo aggregate di dominio reversibile. Le preferenze devono
essere private, configurabili senza AI, prive di default temporali impliciti e
sicure durante retry Queue, replay Telegram e modifiche concorrenti. D1 non
offre una transazione interattiva portabile fra lettura applicativa e più
statement, mentre `batch()` è atomico.

## Decisione

- Il profilo è una riga `user_preferences` identificata esclusivamente da
  `user_id`; non esistono lookup per ID nudo o identificatori Telegram.
- B1.1 supporta lingua `it`, formato `12h|24h`, valuta ISO 4217 riconosciuta dal
  runtime e timezone canonica validata con `Intl.DateTimeFormat`. Non si salva
  un offset e non si introduce Temporal.
- Creazione e aggiornamento richiedono sempre tutti e quattro i valori tramite
  `/impostazioni imposta <lingua> <timezone> <formato> <valuta>`; nessun campo
  mancante riceve un default inventato.
- Ogni mutation incrementa `version` e scrive `last_mutation_key`. Mutation,
  audit e record Undo sono statement condizionali nello stesso `D1.batch()`;
  il marker impedisce di attribuire a una richiesta una write concorrente.
- Il token Undo è un UUID opaco, legato a `scope_user_id`, valido 15 minuti e
  monouso. L'applicazione richiede la stessa `version` prodotta dalla mutation;
  una preferenza cambiata nel frattempo rende l'Undo stale.
- I record Undo scaduti vengono eliminati in batch bounded e user-scoped. Il
  profilo resta fino alla cancellazione account; l'audit segue la retention
  approvata per i dati core.

## Conseguenze

- Un retry con la stessa idempotency key restituisce la ricevuta originale e
  non incrementa la versione. Se il record Undo è già stato eliminato, la
  mutation resta deduplicata tramite audit ma la risposta dichiara Undo non più
  disponibile.
- Annullare la prima creazione rimuove il profilo; annullare un aggiornamento
  ripristina i valori precedenti con una nuova versione monotona.
- `/annulla` è per ora instradato al solo dominio preferenze. Le future entità
  dovranno introdurre routing tipizzato senza rendere il token cross-tenant.
- La validità di una valuta dipende dai dati ICU del runtime compatibile; il
  codice non mantiene una copia locale potenzialmente obsoleta di ISO 4217.

## Condizioni di riesame

Riesaminare quando B1.2 richiede semantica di eventi, quando più domini usano
`/annulla`, se D1 introduce primitive transazionali diverse o se una nuova
lingua viene realmente localizzata end-to-end.
