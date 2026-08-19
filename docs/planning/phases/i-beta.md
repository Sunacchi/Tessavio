# Phase I — Mini App, diritti e core beta

> Stato: **non attiva**. Gate di chiusura della core beta.

## I1 — Mini App minima

- [ ] definire superficie minima: impostazioni, AI, privacy e calendario, senza
      duplicare inutilmente il bot;
- [ ] verificare `initData` Telegram lato server e usare sessioni firmate, brevi e ruotate;
- [ ] applicare CSRF/replay protection, CSP, secure headers e rate limiting;
- [ ] ricostruire sempre user/space scope lato server, mai fidarsi di ID client;
- [ ] implementare impostazioni e connessioni senza esporre credenziali;
- [ ] testare sessione scaduta/riusata, IDOR, XSS, clickjacking, cross-tenant,
      responsive e accessibilità.

## I2 — Export e cancellazione

- [ ] implementare export JSON e CSV per domini pertinenti con provenance/scope;
- [ ] implementare delete account con re-auth/conferma, revoca integrazioni,
      purge dati e ricevuta sul trattamento residuo;
- [ ] introdurre tombstone anti-resurrection per job Queue/Cron/provider pendenti;
- [ ] testare delete concorrente, retry idempotente e policy su dati
      condivisi/audit/backup;
- [ ] documentare retention/export/delete nel linguaggio mostrato all'utente;
- [ ] validare migration I e recovery dello stato cancellazione/export.

## I3.1 — Sicurezza, privacy e compliance

- [ ] aggiornare threat model e data-flow map end-to-end;
- [ ] eseguire review avversariale cross-tenant su HTTP, Queue, Cron, Mini App e OAuth;
- [ ] eseguire secret/log/fixture scan e dependency vulnerability review;
- [ ] validare rate limit per utente, chat, IP/endpoint e provider;
- [ ] verificare key rotation, credential deletion, OAuth revoke e callback replay;
- [ ] approvare retention table, processor map e testi trasparenza AI;
- [ ] approvare matrice residenza/subprocessori e DPIA per dati altamente
      personali/sensibili e uso AI prima del pilot;
- [ ] eseguire purge con fake clock su record scaduti/non scaduti di tenant diversi,
      ripetizione idempotente, fault/recovery e legal hold;
- [ ] completare revisione legale prima di qualunque commercializzazione.

## I3.2 — Affidabilità e prestazioni

- [ ] definire SLO e budget di latenza/errori da misure staging, non da ipotesi;
- [ ] eseguire load test su webhook, Queue, D1 hot query e reminder burst;
- [ ] usare `EXPLAIN QUERY PLAN` per tutte le query hot e fissare gli indici necessari;
- [ ] provare retry storm, poison message, provider outage e Telegram rate limit;
- [ ] provare backup/export e restore D1 in ambiente isolato;
- [ ] documentare rollback applicazione e migration recovery;
- [ ] configurare alert su error rate, queue lag, reminder stuck, auth failure e budget anomaly;
- [ ] misurare e applicare i trigger pre-pilot per dimensione D1, p95 query,
      `overloaded`, write throughput, Queue lag e DLQ;
- [ ] verificare graceful degradation `NO_AI` e integrazioni disconnesse.

## I3.3 — Release candidate e pilot

- [ ] creare staging isolato con bot, D1, Queue e segreti distinti;
- [ ] verificare retention/monitor/alert DLQ e replay bounded con envelope e
      idempotency key invariati prima di accettare dati pilot;
- [ ] eseguire smoke test end-to-end senza dati o token personali;
- [ ] eseguire il percorso completo onboarding -> core -> Inbox/AI -> media ->
      planner -> sharing -> briefing -> Google -> Mini App -> export/delete;
- [ ] eseguire pilot bounded con utenti consenzienti e canale feedback definito;
- [ ] triagiare ogni feedback come blocker beta, backlog futuro o non-obiettivo;
- [ ] correggere blocker con regression test e ripetere i gate pertinenti;
- [ ] produrre go/no-go report con evidenze, rischi residui e accettazioni esplicite;
- [ ] autorizzare separatamente deploy production e piano di rollback.
