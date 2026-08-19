# Architecture Decision Records

Gli ADR registrano decisioni difficili da ricostruire dal codice. Stato ammesso: `proposed`, `accepted`, `superseded`, `rejected`.

- [ADR-0001 — Modular monolith on Cloudflare](0001-modular-monolith-cloudflare.md)
- [ADR-0002 — Deterministic core and AI proposal boundary](0002-deterministic-core-ai-boundary.md)
- [ADR-0003 — Shared EU D1 with mandatory tenant scope](0003-shared-eu-d1-tenancy.md)
- [ADR-0004 — Webhook, Queue and reminder delivery](0004-webhook-queue-reminders.md)
- [ADR-0005 — User-owned AI credentials and privacy](0005-byok-and-ai-privacy.md)
- [ADR-0006 — Development orchestration and code graph](0006-development-tooling.md)
- [ADR-0007 — At-least-once transport and logical idempotency](0007-at-least-once-logical-idempotency.md)
- [ADR-0008 — A1 foundation toolchain, recovery and delivery policy](0008-a1-foundation-decisions.md)
- [ADR-0009 — Open Banking escluso dal prodotto](0009-no-open-banking.md)
- [ADR-0010 — Tessavio Inbox e confini dei domini personali](0010-inbox-and-domain-boundaries.md)
- [ADR-0011 — Google Calendar a livelli di affidabilità](0011-google-calendar-sync-levels.md)
- [ADR-0012 — Preferenze B1.1 e Undo versionato](0012-b1-preferences-and-undo.md)
- [ADR-0013 — Contratto temporale degli eventi one-off B1.2](0013-b1-one-off-event-time-contract.md)
- [ADR-0014 — B2 reminder one-off, quiet hours e delivery leased](0014-b2-reminder-delivery.md)
- [ADR-0015 — B3 task private, scadenze tipizzate e state machine](0015-b3-task-contract.md)
- [ADR-0016 — B4 lavoro: piano, consuntivo, pause e report riproducibili](0016-b4-work-time-contract.md)
- [ADR-0017 — B5 finanze: registro privato, minor unit e Undo versionato](0017-b5-finance-contract.md)
- [ADR-0018 — B6.1 liste, item e note private](0018-b6-private-lists-notes-contract.md)
- [ADR-0019 — B6.2 ricorrenza minima dei reminder](0019-b6-minimal-reminder-recurrence.md)
- [ADR-0020 — B7 report base trasversali e CSV bounded](0020-b7-base-reports.md)
- [ADR-0021 — Chiusura trasversale della Phase B](0021-phase-b-closure.md)
- [ADR-0022 — Budget dei moduli e struttura per slice](0022-module-structure-budgets.md)

## Template

Ogni nuovo ADR include almeno: stato, data, contesto, decisione, conseguenze e condizioni di riesame. Non riscrivere retroattivamente una decisione superata: crearne una nuova e collegare entrambe.
