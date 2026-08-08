# Definition of Done

Una feature non è completa solo perché passa il caso felice. Applicare tutti i gate pertinenti.

## Funzionalità

- [ ] comportamento normale e casi limite specificati;
- [ ] input ambiguo gestito senza inventare dati;
- [ ] messaggio utente utile, senza stack trace;
- [ ] fallback deterministico quando l'AI non è disponibile;
- [ ] comportamento condiviso/privato esplicito.
- [ ] provenance distingue dati inseriti, estratti, importati, calcolati e stimati;
- [ ] notifiche rispettano preferenze/quiet hours e non ripetono lo stesso avviso logico.

## Tempo e denaro

- [ ] timezone IANA e date relative corrette;
- [ ] casi DST, attraversamento mezzanotte e date-only coperti quando applicabili;
- [ ] importi rappresentati in unità minori intere.
- [ ] split conserva la somma esatta con arrotondamento deterministico;
- [ ] forecast espone dati/periodo/formula ed è etichettato come stima, non consulenza.

## Dati e sicurezza

- [ ] scope owner/space in ogni accesso tenant-scoped;
- [ ] authorization centralizzata prima della mutazione;
- [ ] idempotency key e duplicate handling;
- [ ] audit prima/dopo e correlation ID;
- [ ] Undo per operazioni reversibili;
- [ ] nessun segreto, contenuto personale o raw media nei log;
- [ ] retention e cancellazione definite.
- [ ] link cross-domain autorizzati su entrambe le risorse e privi di accesso per ID nudo;
- [ ] input file/link/CSV ha limiti, timeout e lifecycle del contenuto raw verificati.

## AI

- [ ] output strict e validazione server-side;
- [ ] nessun accesso database diretto;
- [ ] context minimization e privacy policy rispettate;
- [ ] budget e costo massimo applicati;
- [ ] fallback compatibili per capability/privacy/costo;
- [ ] benchmark aggiornato se cambia modello, prompt o schema.
- [ ] prompt injection nel contenuto utente/allegato non amplia tool, scope o policy.

## Integrazioni e proattività

- [ ] dominio locale resta utilizzabile durante outage/disconnessione;
- [ ] outbox/delivery dedupe e retry temporaneo/permanente sono testati;
- [ ] mapping e cursor esterni sono tenant/account scoped;
- [ ] riconciliazione e conflitti non usano last-write-wins cieco;
- [ ] revoca/disconnessione ferma nuovi job e rimuove credenziali locali;
- [ ] briefing degrada per singolo contributor senza fallire o duplicare l'intero invio.

## Limiti di prodotto

- [ ] nessun adapter, secret, tabella o dipendenza Open Banking;
- [ ] funzioni benessere non formulano diagnosi, dosi o prescrizioni;
- [ ] finanza non muove denaro e non presenta stime come consulenza.

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
- [ ] DLQ ha retention, monitor/alert e replay con envelope/idempotency key invariati;
- [ ] residenza e subprocessori sono verificati per ogni passaggio, non dedotti
      dalla sola giurisdizione del database;
- [ ] DPIA e revisione legale applicabili sono chiuse prima del pilot con dati reali;
- [ ] capacità D1/Queue è misurata contro trigger su size, p95 query,
      `overloaded`, write throughput e lag.
