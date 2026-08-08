# Definition of Done

Una feature non è completa solo perché passa il caso felice. Applicare tutti i gate pertinenti.

## Funzionalità

- [ ] comportamento normale e casi limite specificati;
- [ ] input ambiguo gestito senza inventare dati;
- [ ] messaggio utente utile, senza stack trace;
- [ ] fallback deterministico quando l'AI non è disponibile;
- [ ] comportamento condiviso/privato esplicito.

## Tempo e denaro

- [ ] timezone IANA e date relative corrette;
- [ ] casi DST, attraversamento mezzanotte e date-only coperti quando applicabili;
- [ ] importi rappresentati in unità minori intere.

## Dati e sicurezza

- [ ] scope owner/space in ogni accesso tenant-scoped;
- [ ] authorization centralizzata prima della mutazione;
- [ ] idempotency key e duplicate handling;
- [ ] audit prima/dopo e correlation ID;
- [ ] Undo per operazioni reversibili;
- [ ] nessun segreto, contenuto personale o raw media nei log;
- [ ] retention e cancellazione definite.

## AI

- [ ] output strict e validazione server-side;
- [ ] nessun accesso database diretto;
- [ ] context minimization e privacy policy rispettate;
- [ ] budget e costo massimo applicati;
- [ ] fallback compatibili per capability/privacy/costo;
- [ ] benchmark aggiornato se cambia modello, prompt o schema.

## Qualità

- [ ] unit test;
- [ ] integration test del flusso modificato;
- [ ] test negativo di autorizzazione quando tocca dati;
- [ ] property test per invarianti temporali, monetari, recurrence o planner;
- [ ] regression test per bug fix;
- [ ] lint, typecheck e suite pertinenti verdi;
- [ ] migration validata e backward-compatible quando applicabile;
- [ ] documentazione e ADR aggiornati.

## Operatività

- [ ] log e metriche sufficienti per diagnosticare senza dati personali;
- [ ] retry/permanent failure distinti;
- [ ] rollback o recovery documentati;
- [ ] limiti e dipendenze versionati, non assunti come permanenti.
