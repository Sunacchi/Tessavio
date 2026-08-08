# ADR-0001 — Modular monolith on Cloudflare

- Status: accepted
- Date: 2026-08-08

## Context

Il prodotto deve partire per pochi utenti, usare infrastruttura economica e poter crescere senza riscrivere il dominio. Microservizi precoci moltiplicherebbero deploy, contratti e failure mode.

## Decision

Usare TypeScript strict in un modular monolith su Cloudflare Workers. D1 EU è la fonte della verità, Queue gestisce lavoro asincrono e Cron individua lavoro dovuto. Hono è ammesso solo se semplifica il routing; grammY è il candidato Telegram principale.

## Consequences

I moduli hanno confini interni e porte testabili, ma condividono repository e deployment. Qualunque estrazione futura richiede evidenze da limiti, carico o ownership, non preferenze stilistiche.

## Revisit when

Un confine presenta scaling, affidabilità o ciclo di rilascio realmente indipendente e misurato.
