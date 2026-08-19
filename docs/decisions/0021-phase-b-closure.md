# ADR-0021 — Chiusura trasversale della Phase B

Stato: accepted  
Data: 2026-08-19

## Contesto

Le slice B1-B7 erano complete, ma tre proprietà restavano da dimostrare come
prodotto unico: una vista giornaliera coerente, retention/purge uniforme e un
flusso end-to-end senza dipendenza AI. La chiusura non deve aggiungere nuovi
domini, binding, migration o integrazioni future.

## Decisione

- `/oggi` e `/domani` compongono eventi attivi, task aperte in scadenza,
  reminder in stato `pending|claimed|sending` e turni pianificati. Ogni porta è
  user-scoped e ogni capability viene autorizzata prima della relativa lettura.
- I reminder giornalieri usano `due_at_utc`: un rinvio dovuto alle quiet hours
  sposta coerentemente il reminder al giorno effettivo di consegna. Record
  conclusi o annullati non appaiono nella vista operativa.
- Ogni contributor legge al massimo 51 record e ne mostra 50; un eccesso produce
  il marker bounded già usato dalla vista giornaliera.
- I token Undo B mantengono TTL di 15 minuti, enforcement al momento dell'Undo e
  purge bounded user-scoped. Le prove trasversali coprono preferenze, eventi,
  task, reminder, ricorrenze, lavoro, finanze e liste/note con fake clock,
  secondo passaggio idempotente e tenant concorrente non modificato.
- Il ledger di delivery reminder conserva le righe per 30 giorni. Su ogni flusso
  di delivery elimina al massimo 100 righe terminali dello stesso utente con
  `created_at` oltre soglia; `pending|sending` non vengono rimossi. La Queue ha
  una retention inferiore alla finestra del ledger, quindi la dedupe non viene
  rimossa mentre un messaggio fisico può ancora essere riconsegnato.
- La demo di chiusura attraversa webhook Telegram, Queue consumer, application,
  tutti i domini B e D1, include report testuale/CSV e Undo, e costruisce
  esplicitamente un runtime senza binding o credenziali AI.

## Conseguenze

- Phase B può essere dichiarata completata senza attivare C1.
- Nessuna query tenant-scoped viene eseguita per ID nudo e nessuna purge globale
  attraversa utenti.
- La rimozione fisica dei token Undo è opportunistica sul successivo accesso al
  relativo dominio; la scadenza funzionale resta immediata e indipendente dalla
  purge.
- Non vengono introdotti Cron aggiuntivi, nuove tabelle, migration, dipendenze o
  risorse Cloudflare.

## Condizioni di riesame

Riesaminare prima del pilot se serve una scadenza fisica garantita anche per
utenti completamente inattivi, se la retention Queue supera 30 giorni o se una
vista briefing deve includere record reminder conclusi.
