# Milestone corrente — B6.2 Ricorrenza minima dei reminder (completata)

**Stato: completata localmente il 2026-08-19.** B1-B6.2 sono completate. B7
report base è la prossima milestone prevista ma non è attivata; richiede un
aggiornamento esplicito di questo file. Nessuna risorsa Cloudflare remota è stata
creata e nessun deploy è stato eseguito.

## Obiettivo

Permettere a un utente Telegram di creare, consultare e fermare reminder privati
giornalieri o settimanali. Il core resta deterministico e genera normali reminder
one-off tramite D1 e il Cron già esistente.

## Contratto autorizzato

- frequenze esclusivamente `daily|weekly`;
- start locale futuro, ora civile e timezone IANA conservate nella regola;
- risoluzione DST con Temporal `later`, mai offset fisso o calcolo manuale;
- create/read/list/cancel con `UserScope`, expected version, audit e Undo;
- discovery Cron limitata a ID e owner, poi accesso scoped e CAS atomico;
- una sola occorrenza generata per regola dovuta; slot arretrati intermedi
  coalesced fino al primo slot futuro;
- occorrenza one-off e provenance `calculated_recurrence` in tabella separata;
- riuso integrale di claim, Queue, quiet hours e delivery dedupe B2;
- nessun nuovo Cron, Queue, binding o modello AI.

Comandi:

```text
/promemoria ricorrente <giornaliero|settimanale> YYYY-MM-DDTHH:mm | Testo
/promemoria ricorrenza <id>
/promemoria ricorrenze
/promemoria ferma <id> <versione>
/annulla rec_<token>
```

Il contratto completo è in
[ADR-0019](../decisions/0019-b6-minimal-reminder-recurrence.md).

## Ordine di implementazione

1. dominio temporale e property test;
2. parser, use case, porte e authorization;
3. schema additivo, migration e repository tenant-scoped;
4. generazione bounded nel scheduled handler esistente;
5. test integrazione, retry/concorrenza, DST, security, migration e query-plan;
6. runbook, documentazione e tutti i gate della Definition of Done.

## Exit criteria

- daily e weekly preservano regola civile e producono il prossimo instant
  corretto attraverso DST, mezzanotte e anni bisestili;
- retry o Cron concorrenti non duplicano regole, occorrenze, audit o delivery;
- downtime genera al massimo un reminder arretrato per regola e avanza al primo
  slot futuro;
- ogni read/write/Undo utente è tenant-scoped e testato cross-user;
- create/cancel sono idempotenti, versionati, auditati e annullabili;
- una regola cancellata non genera nuove occorrenze; una già materializzata resta
  cancellabile come reminder one-off;
- migration fresh e upgrade da B6.1 popolata preservano tutti i dati;
- query hot usano gli indici previsti e recovery/rollback sono documentati;
- `npm run validate` è verde e nessun deploy remoto viene eseguito.

## Out of scope

- frequenze diverse da giornaliera/settimanale, intervalli custom e fine serie;
- eccezioni, pause, modifica, backfill e cancellazione bulk delle occorrenze;
- ricorrenze per task, eventi, liste, lavoro o finanze;
- AI, linguaggio naturale, condivisione, Google Calendar e nuovi servizi;
- Open Banking, pagamenti e deploy remoto.

## Evidenza di chiusura

- ADR-0019 congela target reminder, frequenze, DST `later`, coalescing e confini;
- dominio Temporal, parser e use case implementano create/read/list/cancel e
  calcolo del primo slot futuro senza AI o `rrule`;
- migration additiva `0008_redundant_morlun.sql` introduce regole, Undo e mapping
  con indici e FK composite tenant-scoped;
- il Cron esistente materializza reminder one-off con CAS, dedupe dello slot,
  provenance e audit, poi riusa claim/Queue/quiet hours/delivery B2;
- test unitari, property, integrazione, security e migration coprono DST,
  coalescing, retry/concorrenza, expected version, Undo e cross-tenant;
- `npm run validate` è verde: 28 file di test, 133 test e build Worker dry-run;
  nessun nuovo binding, risorsa remota o deploy.
