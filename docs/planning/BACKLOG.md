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

- [ ] reminder state machine and indices;
- [ ] atomic due-reminder claim;
- [ ] `SEND_NOTIFICATION` consumer with dedupe key;
- [ ] temporary/permanent error classification;
- [ ] scheduled/queue retry integration tests.

## Foundation validation debt (closed 2026-08-08)

- [x] seam Queue inietta clock/ID/reply e usa lo stesso clock in claim,
      processing e `inbox.fail`;
- [x] delivery distingue rifiuto Bot API retryable certo da risultato di rete
      ambiguo, senza duplicare identity/effect/audit o reply consegnate;
- [x] regression test permanent/retryable/ambiguous e lease con FakeClock;
- [x] `.serena/` resta tooling locale ignorato, senza cancellarne i dati;
- [x] evidenza: `npm run validate` verde (21 test) e
      `npm audit --omit=dev` con 0 vulnerabilità.

## B1 — Preferenze + agenda one-off (active)

La milestone esecutiva è definita in `CURRENT_MILESTONE.md`; non preparare
scaffold B2 durante questa slice.

- [ ] **B1.1 prossimo incremento:** fissare scenari/sintassi e consegnare
      create/read/update/Undo delle preferenze temporali user-scoped;
- [ ] provare migration/recovery, timezone validation, duplicate, stale Undo e
      isolamento B1.1 prima di iniziare eventi;
- [ ] **B1.2:** modellare e consegnare eventi `date-only` e instant con scope utente;
- [ ] B1.1 valida timezone IANA con API standard (`Intl.DateTimeFormat`), senza
      richiedere Temporal o un polyfill;
- [ ] B1.2 ripete il probe Workers e sceglie/fissa un solo polyfill Temporal
      just-in-time soltanto se il runtime continua a non esporre `Temporal`;
- [ ] aggiungere migration, indici e query tenant-scoped;
- [ ] implementare create/read/update/cancel e Undo idempotenti e auditabili;
- [ ] implementare `/oggi` e `/domani` nella timezone IANA dell'utente;
- [ ] coprire DST, mezzanotte, duplicate, stale Undo e cross-tenant con test;
- [ ] documentare retention, purge, rollout e migration recovery;
- [ ] chiudere tutti i gate applicabili prima di attivare B2.

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
- [x] keep B1 active and select B1.1 preferences as the next bounded increment;
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
- [ ] scegliere l'eventuale polyfill con versione esatta soltanto al contract
      packet B1.2, dopo un nuovo probe; nessun pacchetto è scelto o installato ora;
- [x] document local D1/Queue test strategy.
- [x] decide A2 Foundation versus Phase B and update roadmap/milestone consistently.
