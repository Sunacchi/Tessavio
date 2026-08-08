# ADR-0008 — A1 foundation toolchain, recovery and delivery policy

- Status: accepted
- Date: 2026-08-08

## Context

A1 deve produrre una vertical slice riproducibile senza introdurre framework o
servizi futuri. D1, Queue e Telegram non condividono una transazione: servono
stati durevoli, recovery e una policy esplicita per gli invii remoti ambigui.

## Decision

- usare npm 11.8.0 su Node.js 24.13.1, con manifest e lockfile esatti;
- fissare Wrangler 4.120.0, TypeScript 6.0.3, Vitest 4.1.10, pool Workers
  0.20.3, grammY 1.45.1, Zod 4.4.3, Drizzle ORM 0.45.2 e Drizzle Kit 0.31.10;
- usare native Fetch: A1 ha un solo route esatto e Hono non riduce la superficie;
- non introdurre Temporal o un polyfill: `/start` non usa tempo civile;
- usare Drizzle come schema tipizzato e migration ownership; usare SQL D1
  preparato soltanto per state transition, conditional insert, lease e batch
  atomici che Drizzle non rende più chiari;
- testare D1 con il runtime Miniflare/Workers e migration reali; usare fake solo
  per Queue producer, clock, ID e Telegram reply quando il test deve controllare
  un crash window;
- conservare l'inbox prima del publish. Telegram retry e il Cron ogni minuto
  ripubblicano `pending_enqueue` vecchi di 30 secondi con lo stesso envelope;
- adottare Queue at-least-once e una sola esecuzione logica con `update_id`,
  `job_id`, effect key, lease e ledger;
- adottare at-most-once per la reply A1: `sending` viene scritto prima della
  chiamata. Un esito remoto ignoto diventa `ambiguous` e non viene ritentato
  automaticamente; non si ripetono mai identity/audit/effect;
- distinguere un rifiuto Bot API certo da un esito ignoto: `GrammyError` 429 o
  5xx riporta il ledger a `pending` e usa il retry Queue bounded; gli altri 4xx
  sono permanenti. `HttpError` e fallimenti senza risposta affidabile restano
  `AMBIGUOUS_EXTERNAL` e seguono la policy at-most-once;
- iniettare clock, generatore ID e reply port nel consumer Queue; claim,
  processing, failure transition e metriche di latenza usano la stessa istanza
  di clock;
- il provisioning identità è idempotente e auditato nello stesso batch D1. Non
  offre Undo perché è creazione dell'account tecnico; la cancellazione account
  sarà il percorso esplicito previsto dalla relativa milestone;
- fondere la precedente A2 reminder infrastructure nella prima vertical slice
  reminder della Phase B: non verrà costruito uno scaffold orizzontale separato.

## Retention A1

Fino all'approvazione pre-produzione si applicano i seguenti limiti operativi:

| Categoria              |                    Retention | Recovery/cancellazione                                                     |
| ---------------------- | ---------------------------: | -------------------------------------------------------------------------- |
| rate bucket            |         massimo due finestre | cleanup opportunistico a ogni richiesta                                    |
| concurrency lease      |                   30 secondi | cleanup opportunistico; release in `finally`                               |
| inbox normalizzato     |                     7 giorni | replay con stessa chiave; purge idempotente da completare prima della beta |
| effect/delivery ledger |                    30 giorni | necessario per dedupe e diagnosi                                           |
| audit identità         |             90 giorni minimo | policy legale da approvare prima di produzione                             |
| user/identity          | fino a cancellazione account | delete workflow in milestone dedicata                                      |

Nessun nome, username o payload Telegram raw viene persistito. Il testo minimo
normalizzato resta personale e non viene mai scritto nei log.

## Consequences

Il webhook esegue D1 e un publish Queue ma non dominio o Telegram outbound. Più
publish fisici sono accettati. Un crash dopo send remoto e prima dell'update del
ledger può ridurre una reply a stato ambiguo: questa perdita potenziale è
preferita a una doppia risposta automatica in A1 ed è osservabile senza
contenuto. Un rifiuto Bot API temporaneo certo può invece essere ritentato senza
duplicare una consegna remota.

Gli ID D1 presenti nel file Wrangler per staging e production sono sentinel non
distribuibili e devono essere sostituiti dagli ID creati con giurisdizione EU.
La creazione di risorse e qualunque deploy restano operazioni autorizzate a parte.

## Revisit when

Si misura il tasso di reply ambigue, si introduce il primo reminder della Phase
B, oppure la policy legale/retention viene approvata per produzione.
