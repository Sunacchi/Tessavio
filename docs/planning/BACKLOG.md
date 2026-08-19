# Technical backlog

## A0 — Agent-ready repository

- [x] root and scoped instructions;
- [x] custom Codex agents;
- [x] architecture and ADR baseline;
- [x] roadmap, DoD, privacy and development runbooks;
- [x] validate all internal Markdown links and TOML files.

## A1 — Foundation vertical slice

- [x] initialize package manager, TypeScript strict, Wrangler and Vitest;
- [x] verify and pin grammY, Hono if justified, Drizzle, Zod and test dependencies;
- [x] typed Worker environment and separate local/staging/prod configuration;
- [x] D1 EU provisioning runbook and initial versioned migration;
- [x] internal user identity mapped from Telegram `user_id`;
- [x] Telegram webhook secret/schema validation and update dedupe;
- [x] decide durable dedupe -> enqueue recovery and logical idempotency semantics;
- [x] versioned queue envelope and `INBOUND_MESSAGE` consumer;
- [x] deterministic `/start` slice without AI;
- [x] centralized authorization seam;
- [x] structured redacted logging and correlation ID;
- [x] baseline payload/rate/concurrency limits at untrusted entrypoints;
- [x] effect/delivery ledger semantics for retries and ambiguous external sends;
- [x] A1 audit/Undo applicability and retention for identity/inbox/job records;
- [x] integration test webhook -> queue -> D1/reply mock;
- [x] duplicate update and cross-user negative tests.
- [x] fault-injection tests around dedupe, enqueue, commit, send and ack;
- [x] A1 recovery runbook for stuck inbox, poison job and ambiguous reply.

## A2 — Reminder infrastructure (merged into Phase B)

Decisione ADR-0008: queste attività entrano nella prima vertical slice reminder
end-to-end della Phase B; non costituiscono una milestone Foundation separata.

- [x] reminder state machine and indices;
- [x] atomic due-reminder claim;
- [x] `SEND_NOTIFICATION` consumer with dedupe key;
- [x] temporary/permanent/ambiguous error classification;
- [x] scheduled/queue retry integration tests.

## Foundation validation debt (closed 2026-08-08)

- [x] seam Queue inietta clock/ID/reply e usa lo stesso clock in claim,
      processing e `inbox.fail`;
- [x] delivery distingue rifiuto Bot API retryable certo da risultato di rete
      ambiguo, senza duplicare identity/effect/audit o reply consegnate;
- [x] regression test permanent/retryable/ambiguous e lease con FakeClock;
- [x] `.serena/` resta tooling locale ignorato, senza cancellarne i dati;
- [x] evidenza: `npm run validate` verde (21 test) e
      `npm audit --omit=dev` con 0 vulnerabilità.

## B1 — Preferenze + agenda one-off (completed)

B1 è chiusa; la milestone esecutiva corrente è definita in
`CURRENT_MILESTONE.md`.

- [x] **B1.1:** fissare scenari/sintassi e consegnare
      create/read/update/Undo delle preferenze temporali user-scoped;
- [x] provare migration/recovery, timezone validation, duplicate, stale Undo e
      isolamento B1.1 prima di iniziare eventi;
- [x] **B1.2:** modellare e consegnare eventi `date-only` e instant con scope utente;
- [x] B1.1 valida timezone IANA con API standard (`Intl.DateTimeFormat`), senza
      richiedere Temporal o un polyfill;
- [x] B1.2 ripete il probe Workers e sceglie/fissa un solo polyfill Temporal
      just-in-time soltanto se il runtime continua a non esporre `Temporal`;
- [x] aggiungere migration, indici e query tenant-scoped per le preferenze;
- [x] implementare create/read/update/cancel e Undo idempotenti e auditabili;
- [x] implementare `/oggi` e `/domani` nella timezone IANA dell'utente;
- [x] coprire DST, mezzanotte, duplicate, stale Undo e cross-tenant con test;
- [x] documentare retention, purge, rollout e migration recovery B1.1;
- [x] documentare retention, purge, rollout e migration recovery B1.2;
- [x] chiudere tutti i gate applicabili prima di attivare B2.

## B2 — Reminder end-to-end (completed)

- [x] comandi espliciti create/read/list/cancel e Undo user-scoped;
- [x] quiet hours locali versionate e valutate con timezone IANA/Temporal;
- [x] claim leased, Queue notification e recovery con envelope stabile;
- [x] delivery ledger, dedupe, retry bounded e policy ambiguous at-most-once;
- [x] test concorrenza, DST, duplicate, recovery e cross-tenant;
- [x] migration, query plan, ADR e runbook recovery/rollback.

## B3 — Task (completed)

- [x] comandi espliciti create/read/list/complete/reopen e Undo user-scoped;
- [x] scadenze `none|date_only|instant`, priorità e stato senza default inventati;
- [x] mutation/audit/Undo atomici, idempotenti e version-checked;
- [x] `/oggi` e `/domani` aggregano task in scadenza con finestre IANA/DST;
- [x] test property temporali, duplicate, stale/expired/replay e cross-tenant;
- [x] migration, query plan, ADR e runbook recovery/rollback.

## B4 — Lavoro (completed)

- [x] regole data-driven, turni pianificati, consuntivi e pause separate;
- [x] intervalli UTC con timezone IANA, mezzanotte/DST e report bounded;
- [x] mutation/audit/Undo atomici, idempotenti e tenant-scoped;
- [x] migration, query plan, ADR e runbook recovery/rollback.

## B5 — Finanze base (completed)

- [x] spese/entrate manuali in minor unit, valuta e giorno civile espliciti;
- [x] correzione, soft delete, totali per valuta e Undo versionato;
- [x] property test monetari, retry, cross-tenant e assenza Open Banking;
- [x] migration, query plan, ADR e runbook recovery/rollback.

## B6.1 — Liste e note private (completed)

La milestone è chiusa localmente; B6.2 è stata attivata e chiusa separatamente.

- [x] congelare ADR con entità/stati, limiti, comandi, retention e delete non bulk;
- [x] implementare liste private, item e note standalone con `UserScope` esplicito;
- [x] applicare version check, authorization, idempotenza, audit e Undo a ogni write;
- [x] aggiungere migration additiva, indici e query plan tenant-scoped;
- [x] coprire input invalidi, duplicate, stale/expired/replay e cross-tenant;
- [x] provare migration fresh e upgrade da B5 popolata e documentare recovery;
- [x] chiudere tutti i gate applicabili prima di attivare B6.2.

## B6.2 — Ricorrenza minima dei reminder (completed)

- [x] fissare in ADR target reminder, frequenze daily/weekly, DST e coalescing;
- [x] implementare dominio Temporal e comandi deterministici senza `rrule` o AI;
- [x] aggiungere regole, Undo e mapping occorrenze con schema solo additivo;
- [x] generare reminder one-off via Cron esistente con CAS e dedupe dello slot;
- [x] riusare Queue, quiet hours e delivery ledger B2 senza nuovi binding;
- [x] coprire property test, DST, retry/concorrenza, Undo e cross-tenant;
- [x] validare migration fresh/upgrade, query plan e recovery;
- [x] chiudere tutti i gate applicabili prima di attivare B7.

## Later phases

Break down Phase B onward only when the preceding exit criteria are met. The
ordered, committed feature list is in `ROADMAP.md` and its pre-audit status in
`REQUIREMENTS_COVERAGE.md`; avoid speculative tickets, tables or adapters that
imply premature APIs. Open Banking is not a later phase.

## Product requirements audit — 2026-08-08

- [x] classify Inbox, finance, briefing, documents, sharing/home, people,
      planner, Google Calendar, travel, wellbeing and deferred integrations;
- [x] assign every approved capability to concrete milestones A-O;
- [x] record universal Inbox/domain boundaries, no Open Banking and staged
      Google Calendar reliability in ADR-0009..0011;
- [x] complete B1-B5 sequentially without scaffolding B6;
- [x] complete B4 work rules, planned shifts, logs, breaks, bounded reports,
      migration/recovery and tenant/retry/DST/Undo tests;
- [x] complete B5 manual expenses/income, exact minor-unit totals, correction,
      soft delete, migration/recovery and tenant/retry/property/Undo tests;
- [ ] do not mark a planned capability complete until code, tests and all
      applicable DoD gates exist.

## Decision gates before implementation

- [x] confirm package manager;
- [x] verify exact dependency versions and compatibility date;
- [x] decide Hono versus native Fetch with a tiny routing comparison;
- [x] choose Drizzle migration workflow versus direct SQL ownership boundaries;
- [x] confermare che A1 non usa tempo civile e non richiede Temporal/polyfill;
- [x] eseguire il probe sul runtime Workers locale fissato: `Temporal` non è
      disponibile con Wrangler 4.120.0, pool Workers 0.20.3 e compatibility date
      2026-08-08;
- [x] fissare `@js-temporal/polyfill@0.5.1` dopo il probe B1.2 e riusarlo in B2;
- [x] document local D1/Queue test strategy.
- [x] decide A2 Foundation versus Phase B and update roadmap/milestone consistently.
