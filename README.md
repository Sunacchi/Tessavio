# Tessavio — assistente personale Telegram

Assistente personale conversazionale, multiutente e BYOK, progettato per Telegram e Cloudflare Workers.

Il principio guida è semplice: **il prodotto deve funzionare anche quando l'AI non funziona**. L'AI interpreta input non strutturati e formula proposte; validazione, autorizzazione, pianificazione, persistenza e invio dei reminder restano deterministici.

## Stato

La Phase A — Foundation è completata e revalidata localmente: la review A1 è
chiusa con `npm run validate` verde e `npm audit --omit=dev` senza
vulnerabilità. Nessuna risorsa Cloudflare remota è stata creata e nessun deploy è
stato eseguito. La milestone attiva è **B1 — Preferenze + agenda one-off**;
B1.1 preferenze temporali è implementata localmente e il prossimo incremento è
B1.2 eventi one-off. Lo scope autorizzato è nella
[milestone corrente](docs/planning/CURRENT_MILESTONE.md).

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
- [Residenza e subprocessori](docs/privacy/PROCESSOR_AND_RESIDENCY_MATRIX.md):
  data-flow e gate DPIA pre-pilot.
- [Roadmap](docs/planning/ROADMAP.md): sequenza delle fasi A-O.
- [Matrice requisiti](docs/planning/REQUIREMENTS_COVERAGE.md): stato reale e
  milestone di Inbox, finanze, briefing, documenti, persone, casa, viaggi,
  benessere e Google Calendar.
- [Master action plan](docs/planning/MASTER_ACTION_PLAN.md): checklist operativa,
  flusso utente, gate e routing del lavoro fino al prodotto esteso.
- [Milestone corrente](docs/planning/CURRENT_MILESTONE.md): perimetro operativo attuale.
- [Definition of Done](docs/planning/DEFINITION_OF_DONE.md): gate per dichiarare completo il lavoro.
- [Strategia di test](docs/TESTING.md): livelli, fixture e prove per dominio.
- [Gate operativi pre-pilot](docs/runbooks/PRE_PILOT_OPERATIONS.md): capacità
  D1, Queue lag, DLQ, alert e trigger di revisit.
- [Manuale agenti](docs/agents/README.md): ruoli, delega e ownership.
- [Decisioni](docs/decisions/README.md): ADR accettati e decisioni differite.

## Stack deciso

- TypeScript strict su Cloudflare Workers.
- Telegram tramite grammY, salvo evidenza contraria in uno spike limitato.
- Hono solo se riduce davvero il routing senza appesantire il Worker.
- Cloudflare D1 in giurisdizione EU, con Drizzle per schema/query normali e SQL
  preparato per hot path motivati; la giurisdizione D1 non regionalizza Worker,
  Queue, Cron, Telegram, subrequest o provider AI.
- Zod e JSON Schema strict ai confini runtime.
- Nessun Temporal polyfill in B1.1: le timezone IANA sono validate con
  `Intl.DateTimeFormat`. L'eventuale polyfill viene scelto e fissato
  just-in-time per B1.2 dopo un nuovo probe Workers.
- Vitest; fast-check per invarianti temporali, monetari e di pianificazione.

Le versioni A1 sono esatte in `package.json` e `package-lock.json`; le decisioni
sono registrate in ADR-0008.

## Scope durevole

Tessavio include nella roadmap corrente l'Inbox universale, finanze personali,
briefing, documenti, persone, spazi/casa, planner, viaggi, routine/benessere e
Google Calendar a livelli dall'export alla sincronizzazione bidirezionale. Si
implementa una sola vertical slice alla volta. Open Banking e pagamenti
automatici sono esclusi; le altre integrazioni esterne sono differite finché il
dominio locale non è utile da solo.
