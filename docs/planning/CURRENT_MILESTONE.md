# Milestone corrente — A1 Foundation vertical slice

**Stato: completata localmente il 2026-08-08.** Nessuna risorsa remota è stata
creata e nessun deploy è stato eseguito. La prossima vertical slice di Phase B
richiede un nuovo aggiornamento esplicito di questo file prima di scrivere codice.

## Obiettivo

Realizzare la prima vertical slice AI-independent: un update Telegram validato e deduplicato attraversa webhook, Queue, identità/autorizzazione e un caso d'uso deterministico, producendo una risposta osservabile senza duplicare dati.

La checklist esecutiva A1, il failure model e i brief per gli agenti sono nel
[master action plan](MASTER_ACTION_PLAN.md#phase-a--foundation). In caso di
conflitto questo file continua a definire lo scope della milestone attiva.

## Prima di scrivere codice

- confermare il package manager;
- verificare e fissare versioni esatte di Wrangler, TypeScript, Vitest, grammY, Zod e Drizzle;
- confrontare Hono con native Fetch sulla superficie reale della slice e usare Hono solo se semplifica;
- verificare il supporto Temporal del runtime; scegliere un solo polyfill se necessario;
- definire strategia locale per D1 e Queue senza usare credenziali prod.

Non usare `latest`, template `full` o installazioni Ruflo/Graphify implicite.

## In scope

- bootstrap TypeScript strict e Worker;
- typed environment/bindings;
- prima migration versionata per identità e deduplica update;
- runbook per creare D1 dev/staging/prod con giurisdizione EU;
- webhook Telegram: POST, secret, Zod, dedupe, enqueue, risposta rapida;
- baseline configurabile per payload size, rate e concurrency agli ingressi non fidati;
- envelope Queue versionato e consumer `INBOUND_MESSAGE`;
- mapping Telegram `user_id` -> internal user ID;
- authorization seam centralizzata;
- comando deterministico minimo `/start`;
- logging strutturato redatto e correlation ID;
- test unitari, integration e security della slice.

## Out of scope

- provider AI, ActionProposal e OAuth OpenRouter;
- vocali, immagini e storage media;
- eventi/task/reminder completi oltre lo schema minimo necessario;
- recurrence e `rrule`;
- Mini App e Google Calendar;
- pagamenti, Workflow e deploy production;
- Graphify prima del completamento di questa slice.

## Exit criteria

- update valido: stato inbox durevole, almeno un tentativo di enqueue recuperabile
  e risposta HTTP rapida;
- update duplicato o enqueue fisicamente ripetuta: nessuna seconda esecuzione
  logica, domain write o audit;
- secret o payload invalido: rifiuto sicuro senza contenuti sensibili nei log;
- payload oversized o richiesta oltre il limite: rifiuto prima dell'enqueue senza
  riflettere secret o contenuto nei log;
- consumer: identità interna risolta, authorization chiamata e risposta mock inviata;
- utente A non può accedere a dati di B;
- queue retry non duplica domain write/audit; la reply segue delivery ledger e
  policy dell'[ADR-0007](../decisions/0007-at-least-once-logical-idempotency.md),
  con esiti remoti ambigui documentati e testati;
- lint, typecheck, unit, integration e security test verdi;
- migration riproducibile e documentazione aggiornata;
- tutti i gate applicabili della Definition of Done soddisfatti.

## Evidenze di chiusura

- `npm ci` riproduce il lockfile esatto;
- `npm run validate` copre format, lint, binding types, typecheck, Drizzle check,
  unit/integration/security test e dry-run build;
- migration `0000_foundation.sql` applicata nei test Workers/D1 da database vuoto;
- test happy path, duplicato fisico/logico, enqueue recovery, active lease,
  Telegram ambiguo, poison envelope, limiti ingressi e cross-tenant negativi;
- provisioning EU e recovery documentati nei runbook A1;
- decisioni, retention e posizione A2 registrate in ADR-0008.
