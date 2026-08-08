# Milestone corrente — B2 Reminder end-to-end (completata)

**Stato: completata localmente il 2026-08-08.** B2 consegna reminder one-off
deterministici, claim leased da Cron, Queue dedicata e delivery Telegram
deduplicata. Nessuna risorsa Cloudflare remota è stata creata e nessun deploy è
stato eseguito. B3 è la prossima milestone ma non viene attivata da questa
consegna.

## Obiettivo

Permettere a un utente Telegram di creare, leggere, elencare e annullare un
promemoria esplicito nel proprio fuso IANA e riceverlo tramite una sola
esecuzione logica, anche con Cron concorrenti, enqueue duplicati e retry Queue.

## Contratto consegnato

- `/promemoria crea YYYY-MM-DDTHH:mm | Testo` crea un reminder privato one-off;
- `/promemoria leggi <id>`, `/promemoria lista` e
  `/promemoria annulla <id>` sono query/mutation user-scoped;
- `/impostazioni quiete HH:mm HH:mm` configura una finestra locale, anche
  cross-midnight; `/impostazioni quiete disattiva` la rimuove;
- `/annulla rem_<token>` applica Undo single-use con TTL di 15 minuti e version
  check a creazione o cancellazione;
- date e ore locali inesistenti o ambigue nei cambi DST vengono rifiutate; un
  reminder deve essere futuro rispetto al timestamp del messaggio;
- non sono introdotti parsing naturale, AI, ricorrenze, task o condivisione.

## State machine e delivery

```text
pending -> claimed -> sending -> sent
                    |         -> permanent_failure
                    |         -> ambiguous
                    -> claimed              (errore retryable certo)
claimed -> pending                          (quiet hours)
pending -> cancelled                       (azione utente)
```

Il Cron seleziona solo ID, owner e timestamp dovuti, quindi effettua un update
condizionale sempre su `(id, user_id)`. Il claim persiste `job_id`, correlation
ID e lease prima dell'enqueue. Il recovery riaccoda lo stesso envelope e la
stessa idempotency key dopo crash prima dell'enqueue o lease scaduta.

Il consumer rivalida `SEND_NOTIFICATION`, ricostruisce `UserScope`, valuta le
preferenze correnti e registra lo snapshot di timezone/quiet hours usato. La
delivery usa `telegram-reminder:<reminder_id>` come dedupe key. Un rifiuto certo
429/5xx è retryable; un rifiuto permanente chiude il reminder; un errore HTTP o
di rete ambiguo applica policy at-most-once e non ritenta l'invio. I tentativi
esterni sono limitati a 6 anche attraverso recovery successivi.

Decisione e recovery sono documentati in
[ADR-0014](../decisions/0014-b2-reminder-delivery.md) e nel
[runbook B2](../runbooks/B2_REMINDERS_RECOVERY.md).

## Exit criteria soddisfatti localmente

- create/read/list/cancel e Undo sono autorizzati, idempotenti e auditati;
- ogni repository tenant-scoped richiede `UserScope` e i test negativi provano
  isolamento read/write/list/Undo;
- claim concorrenti convergono a una sola riga claimed;
- crash prima/dopo enqueue recupera lo stesso envelope stabile;
- duplicate Queue e retry Telegram non duplicano reminder, audit o delivery;
- quiet hours cross-midnight e DST usano il solo polyfill Temporal già fissato;
- errori retryable, permanent e ambiguous producono stati distinti e log senza
  testo del reminder;
- migration fresh/upgrade, indici hot e recovery sono riproducibili;
- format, lint, typecheck, unit, integration, security, migration, build e audit
  dipendenze sono gate obbligatori della consegna locale.

## Out of scope

- ricorrenze e `rrule`;
- reminder collegati a eventi/task/documenti o spazi condivisi;
- briefing e notifiche proattive non richieste esplicitamente;
- AI, `ActionProposal[]`, media e Google Calendar;
- deploy staging/production o creazione di Queue/D1 remote.
