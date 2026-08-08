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

## B1 — Preferenze + agenda one-off (active)

La milestone esecutiva è definita in `CURRENT_MILESTONE.md`; non preparare
scaffold B2 durante questa slice.

- [ ] fissare scenari e sintassi dei comandi deterministici;
- [ ] modellare preferenze, eventi `date-only` e instant con scope utente;
- [ ] scegliere e fissare un solo polyfill Temporal solo se necessario;
- [ ] aggiungere migration, indici e query tenant-scoped;
- [ ] implementare create/read/update/cancel e Undo idempotenti e auditabili;
- [ ] implementare `/oggi` e `/domani` nella timezone IANA dell'utente;
- [ ] coprire DST, mezzanotte, duplicate, stale Undo e cross-tenant con test;
- [ ] documentare retention, purge, rollout e migration recovery;
- [ ] chiudere tutti i gate applicabili prima di attivare B2.

## Later phases

Break down Phase B onward only when the preceding exit criteria are met. The ordered feature list remains in `ROADMAP.md`; avoid speculative tickets that imply premature APIs.

## Decision gates before implementation

- [x] confirm package manager;
- [x] verify exact dependency versions and compatibility date;
- [x] decide Hono versus native Fetch with a tiny routing comparison;
- [x] choose Drizzle migration workflow versus direct SQL ownership boundaries;
- [x] verify Worker Temporal support and choose exactly one polyfill;
- [x] document local D1/Queue test strategy.
- [x] decide A2 Foundation versus Phase B and update roadmap/milestone consistently.
