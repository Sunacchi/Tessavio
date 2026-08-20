# ADR-0019 — B6.2 ricorrenza minima dei reminder

## Stato

Accettata il 2026-08-19.

## Contesto

B2 consegna reminder one-off con claim D1, Queue, dedupe e quiet hours. B6.2 deve
aggiungere una sola ricorrenza concreta senza creare un motore generico,
duplicare il trasporto o affidare il calendario all'AI. Cron e Queue hanno
delivery at-least-once, quindi generazione e invio devono convergere sotto retry.

## Decisione

La ricorrenza appartiene soltanto ai reminder. Una regola privata conserva testo,
frequenza `daily|weekly`, ora civile `HH:mm`, timezone IANA originale, prossima
data civile, prossimo instant UTC, stato `active|cancelled` e versione. Il giorno
settimanale deriva dalla data iniziale e non è un campo ambiguo separato.

Sono supportati soltanto i comandi deterministici:

```text
/promemoria ricorrente <giornaliero|settimanale> YYYY-MM-DDTHH:mm | Testo
/promemoria ricorrenza <id>
/promemoria ricorrenze
/promemoria ferma <id> <versione>
/annulla rec_<token>
```

La data iniziale deve essere futura rispetto al timestamp Telegram. Ogni
occorrenza viene risolta con il polyfill Temporal già fissato e disambiguation
`later`: nei gap si usa il primo instant valido successivo, nei fold il secondo
instant. La regola continua comunque a conservare l'ora civile originale; non si
salvano offset e non si implementa DST manualmente. Un cambio successivo della
timezone profilo non riscrive la regola.

Il Cron esistente seleziona globalmente solo coppie `user_id/id` dovute. Per ogni
coppia ricostruisce `UserScope`, legge la regola scoped e tenta una mutation CAS
atomica che:

1. crea un normale reminder one-off;
2. registra la provenance `calculated_recurrence` in una tabella di mapping;
3. avanza la regola al primo slot strettamente futuro;
4. registra l'audit di generazione.

La chiave univoca `(user_id, recurrence_id, scheduled_local)` e il CAS su versione
impediscono doppie occorrenze sotto Cron concorrenti o retry. Il reminder generato
riusa claim, quiet hours, Queue e ledger delivery B2, inclusa la dedupe per il suo
ID. Non viene aggiunto un Cron, una Queue o un binding.

Se più slot sono scaduti durante un downtime, viene generata soltanto
l'occorrenza memorizzata e la regola avanza al primo slot futuro: gli slot
intermedi sono coalesced, non backfilled. Questo impedisce una raffica di avvisi
arretrati e mantiene il lavoro per regola bounded.

Create e cancel sono autorizzati, idempotenti, auditati e producono Undo
single-use `rec_` di 15 minuti. Undo della creazione è stale dopo la prima
occorrenza; Undo del cancel ripristina la regola. Fermare una regola blocca solo
nuove generazioni: un'occorrenza già materializzata resta un reminder autonomo e
può essere annullata col comando B2.

## Conseguenze

- D1 resta fonte della verità per regole, cursore civile e occorrenze.
- La logica temporale è pura e testabile con proprietà e casi DST.
- Le query utente sono sempre `UserScope`; la discovery Cron non legge testo.
- Non serve `rrule`: due frequenze si esprimono in modo più piccolo con Temporal.
- La semantica coalesced privilegia sicurezza operativa rispetto al backfill.

## Fuori scope

Mensile/annuale, intervalli personalizzati, fine serie, eccezioni, pause,
modifica di regole, recupero degli slot saltati, ricorrenze di task/eventi/liste,
condivisione, linguaggio naturale, AI e sincronizzazione calendario.
