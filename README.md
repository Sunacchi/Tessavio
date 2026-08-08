# Assistente Personale Telegram

Assistente personale conversazionale, multiutente e BYOK, progettato per Telegram e Cloudflare Workers.

Il principio guida è semplice: **il prodotto deve funzionare anche quando l'AI non funziona**. L'AI interpreta input non strutturati e formula proposte; validazione, autorizzazione, pianificazione, persistenza e invio dei reminder restano deterministici.

## Stato

La Phase A — Foundation è implementata localmente: webhook Telegram, inbox D1,
Queue at-least-once, identità interna, authorization, `/start`, audit e delivery
ledger sono coperti da test. Nessuna risorsa Cloudflare remota è stata creata e
nessun deploy è stato eseguito.

## Avvio locale

Prerequisiti: Node.js 24.13.1 e npm 11.8.0.

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state
npm run dev
```

Prima di un handoff eseguire `npm run validate`. I valori reali di bot token e
webhook secret restano solo in `.dev.vars` o nei secret Cloudflare.

## Mappa della documentazione

- [AGENTS.md](AGENTS.md): istruzioni vincolanti per Codex e per gli agenti delegati.
- [Visione e requisiti](docs/PROJECT.md): obiettivi, scope e invarianti di prodotto.
- [Architettura](docs/architecture/ARCHITECTURE.md): componenti, confini e flussi.
- [Sicurezza e privacy](SECURITY.md): baseline obbligatoria.
- [Roadmap](docs/planning/ROADMAP.md): sequenza delle fasi A-I.
- [Master action plan](docs/planning/MASTER_ACTION_PLAN.md): checklist operativa,
  flusso utente, gate e routing del lavoro agli agenti fino alla beta.
- [Milestone corrente](docs/planning/CURRENT_MILESTONE.md): perimetro operativo attuale.
- [Definition of Done](docs/planning/DEFINITION_OF_DONE.md): gate per dichiarare completo il lavoro.
- [Manuale agenti](docs/agents/README.md): ruoli, delega e ownership.
- [Decisioni](docs/decisions/README.md): ADR accettati e decisioni differite.

## Stack deciso

- TypeScript strict su Cloudflare Workers.
- Telegram tramite grammY, salvo evidenza contraria in uno spike limitato.
- Hono solo se riduce davvero il routing senza appesantire il Worker.
- Cloudflare D1 in giurisdizione EU, con Drizzle per schema/query normali e SQL preparato per hot path motivati.
- Zod e JSON Schema strict ai confini runtime.
- Nessun Temporal polyfill in A1; verrà scelto solo nella prima slice che usa tempo civile.
- Vitest; fast-check per invarianti temporali, monetari e di pianificazione.

Le versioni A1 sono esatte in `package.json` e `package-lock.json`; le decisioni
sono registrate in ADR-0008.
