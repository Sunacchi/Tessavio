# ADR-0004 — Webhook, Queue and reminder delivery

- Status: accepted
- Date: 2026-08-08

## Context

Telegram può ritentare gli update e il lavoro AI/media può essere lento. Cron può eseguire in concorrenza e la delivery può fallire temporaneamente.

## Decision

Il webhook verifica secret e schema, deduplica `update_id`, accoda e risponde rapidamente. I consumer elaborano fuori dal request path. Il Cron effettua claim atomico dei reminder dovuti e pubblica `SEND_NOTIFICATION`; la delivery ha `dedupe_key` univoca e retry classificati.

## Consequences

Ogni job usa envelope versionato, job ID, correlation ID, timestamp e attempt. Un retry AI non implica automaticamente una nuova write.
