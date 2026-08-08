# Milestone corrente — B1 Preferenze + agenda one-off

**Stato: attiva dal 2026-08-08 dopo la revalidazione A1.** I finding Foundation
sono chiusi con `npm run validate` verde e `npm audit --omit=dev` senza
vulnerabilità. Nessuna risorsa Cloudflare remota è stata creata e nessun deploy è
stato eseguito. B1 resta deterministica e utilizzabile senza provider AI.

## Obiettivo

Permettere a un utente Telegram di configurare le preferenze temporali minime,
gestire eventi singoli tramite comandi espliciti e consultare `/oggi` e `/domani`
nel proprio fuso IANA, senza inventare dati mancanti e senza leggere o modificare
dati di altri utenti.

La sequenza di prodotto e i gate trasversali sono nel
[master action plan](MASTER_ACTION_PLAN.md#phase-b--core-product-interamente-deterministica).
In caso di conflitto questo file definisce lo scope della milestone attiva.

## Prossimo singolo incremento verificabile — B1.1 Preferenze temporali

Prima di implementare eventi, consegnare il profilo preferenze minimo tramite
comandi deterministici: lingua supportata, timezone IANA, formato ora, valuta
predefinita e lettura delle impostazioni. La write deve essere user-scoped,
autorizzata, idempotente e auditata; una modifica reversibile produce Undo
single-use con TTL/version check.

Evidenza richiesta: migration fresh/upgrade e recovery, validazione timezone
senza offset fisso, create/read/update/Undo, duplicate update e test negativi in
cui l'utente A non legge o modifica le preferenze di B. Solo dopo questi gate la
stessa milestone passa a B1.2 eventi one-off. Nessun requisito delle fasi C-O
autorizza scaffold durante B1.1.

## Modello Codex suggerito

- **Principale:** `gpt-5.6-sol` con reasoning `high`, per coordinare dominio,
  modello temporale, migration, autorizzazione e test end-to-end della slice.
- **Alternativa bilanciata:** `gpt-5.6-terra` con reasoning `high` per attività
  delimitate e meccaniche, mantenendo review finale con il modello principale.
- `xhigh` o `max` non sono il default: usarli solo per un problema circoscritto
  che mostri un miglioramento misurabile di qualità.

Questa è una scelta per l'agente di sviluppo. Non introduce un modello AI nel
prodotto: provider, prompt e `ActionProposal[]` restano fuori scope fino alla
Phase C. La raccomandazione segue la
[guida ufficiale alla scelta dei modelli](https://developers.openai.com/api/docs/guides/latest-model).

## Prima di scrivere codice

- fissare scenari e sintassi dei comandi per preferenze, creazione, lettura,
  modifica, annullamento e Undo di un evento;
- distinguere nel contratto `date-only`, ora civile locale e instant UTC;
- per B1.1 validare identificatori IANA con API standard come
  `Intl.DateTimeFormat`, senza richiedere Temporal;
- per B1.2 ripetere il probe sul runtime Workers e scegliere un solo polyfill,
  con versione esatta verificata just-in-time, soltanto se necessario;
- definire schema, indici, state transition e query sempre `UserScope`-scoped;
- definire audit atomico, idempotency key e policy Undo single-use con TTL e
  version check;
- definire retention e purge delle entità introdotte, con fake clock e test
  cross-tenant;
- aggiornare o creare un ADR se una decisione architetturale cambia.

Non usare `latest`, template `full`, recurrence, `rrule`, provider AI o scaffold
per B2 e slice successive.

## In scope

- preferenze utente minime: lingua supportata, timezone IANA, formato ora,
  valuta predefinita e impostazioni privacy già richieste dalla slice;
- validazione esplicita della timezone B1.1 tramite API standard, senza tabelle
  DST manuali, offset fisso o dipendenza Temporal prematura;
- eventi one-off privati con ID interno e accesso sempre tenant-scoped;
- rappresentazione distinta di eventi `date-only` ed eventi con instant;
- comandi Telegram deterministici per creare, leggere, modificare e annullare
  un evento, con conferme prive di ambiguità;
- `/oggi` e `/domani` calcolati da timestamp del messaggio, data locale e
  timezone IANA dell'utente;
- idempotenza, authorization, audit e Undo per ogni write reversibile;
- migration versionata, rollback/recovery documentati e query hot indicizzate;
- test unitari, integration, security e property test per timezone/DST,
  duplicati, stale Undo e isolamento cross-tenant;
- aggiornamento di comandi, runbook, backlog e documentazione insieme al codice.

## Out of scope

- reminder, Cron di reminder e `SEND_NOTIFICATION` B2;
- task, turni, spese, liste, report aggregati e recurrence;
- parsing in linguaggio naturale, provider AI e `ActionProposal[]`;
- vocali, immagini, Mini App e Google Calendar;
- condivisione fra utenti o spazi;
- briefing, documenti, persone, finanza avanzata, casa, viaggi e benessere;
- Open Banking, che è escluso dal prodotto e non una fase futura;
- deploy staging/production salvo richiesta esplicita separata.

## Exit criteria

- un utente può impostare e rileggere preferenze valide senza provider AI;
- input incompleti o timezone non valide vengono rifiutati senza default
  temporali inventati;
- eventi `date-only` e con instant mantengono semantica distinta in persistenza,
  modifica e rendering;
- `/oggi` e `/domani` sono corretti nei cambi DST e ai confini di mezzanotte;
- create/update/cancel sono autorizzati, idempotenti e auditati; Undo è
  user-bound, single-use e rifiuta replay, scadenza e versione stale;
- retry Queue o update Telegram duplicati non producono una seconda mutation;
- ogni query e mutation negativa dimostra che l'utente A non vede né modifica
  dati dell'utente B;
- retention/purge sono idempotenti, tenant-safe e testati con fake clock;
- migration da database vuoto, rollback/recovery e piano di rollout sono
  riproducibili;
- format, lint, typecheck, unit, integration, security, property test e dry-run
  build sono verdi;
- tutti i gate applicabili della Definition of Done sono soddisfatti prima di
  attivare B2.
