# ADR-0013 — Contratto temporale degli eventi one-off B1.2

- **Stato:** accepted
- **Data:** 2026-08-08

## Contesto

B1.2 introduce il primo dato che deve distinguere un giorno civile da un
intervallo di instant. Il runtime Workers `workerd@1.20260801.1`, provato con la
compatibility date `2026-08-08`, non espone ancora il global `Temporal`; usare
`Date` o offset fissi per convertire ore locali renderebbe errati gap, fold e
giorni da 23/25 ore. Più domini iniziano inoltre a produrre token `/annulla`.

## Decisione

- Un evento `date_only` conserva soltanto `local_date`; non riceve mezzanotte,
  UTC o timezone artificiale.
- Un evento `instant` nasce da inizio/fine civili completi nella timezone IANA
  delle preferenze. Conserva `start_at_utc`, `end_at_utc` e la timezone
  originale; l'intervallo è semiaperto `[start, end)`.
- I comandi sono completi e delimitano il titolo con `|`:

  ```text
  /evento crea data YYYY-MM-DD | Titolo
  /evento crea ora YYYY-MM-DDTHH:mm YYYY-MM-DDTHH:mm | Titolo
  /evento leggi <event-id>
  /evento modifica <event-id> data YYYY-MM-DD | Titolo
  /evento modifica <event-id> ora YYYY-MM-DDTHH:mm YYYY-MM-DDTHH:mm | Titolo
  /evento annulla <event-id>
  /annulla <token-opaco>
  /oggi
  /domani
  ```

- Nessun valore temporale mancante viene inferito. Ore inesistenti nel gap DST
  e ore duplicate nel fold sono rifiutate con disambiguation `reject`.
- `/oggi` e `/domani` derivano il giorno dal timestamp del messaggio Telegram e
  dalla timezone corrente del profilo. Gli instant sono selezionati se
  intersecano il giorno locale, le date-only se coincidono con `local_date`.
- Si usa soltanto `@js-temporal/polyfill@0.5.1`, versione stabile verificata
  just-in-time. Il polyfill resta nel dominio temporale e non introduce stato.
- Gli eventi sono privati e ogni query include `UserScope`. `cancel` è uno stato
  reversibile, non una delete. Create/update/cancel incrementano `version` e
  scrivono mutation, audit e Undo nello stesso `D1.batch()` condizionale.
- I token eventi hanno prefisso `evt_`, sono user-bound, monouso, validi 15
  minuti e richiedono la versione attesa. I token B1.1 senza prefisso continuano
  a essere instradati alle preferenze.
- Eventi attivi e annullati restano fino alla cancellazione account; in B1.2 non
  si introduce una delete irreversibile. I record Undo scaduti sono eliminati
  opportunisticamente in batch bounded e user-scoped; l'audit segue la retention
  core.

## Conseguenze

- Un cambio delle preferenze non altera gli instant esistenti né la loro
  timezone originale; cambia soltanto il giorno e il formato della vista locale.
- Un evento istantaneo può attraversare la mezzanotte o una transizione DST e
  apparire in ogni giorno locale che interseca.
- Il fold non viene scelto implicitamente (`earlier`/`later`): B1.2 preferisce
  una risposta esplicita a un appuntamento salvato nell'ora sbagliata.
- Retry Queue e update Telegram duplicati restituiscono la ricevuta originale
  senza una seconda versione, audit o azione Undo.

## Condizioni di riesame

Riesaminare se il runtime Workers espone Temporal standard senza flag, se la UX
richiede una scelta esplicita fra le due occorrenze di un fold, quando entrano
eventi multi-day date-only/ricorrenti o quando un registro Undo condiviso diventa
più semplice delle tabelle per dominio.
