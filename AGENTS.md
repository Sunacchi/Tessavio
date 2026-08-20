# Tessavio — istruzioni per gli agenti

Assistente personale Telegram multiutente su Cloudflare Workers. **D1 è la fonte
della verità.** L'AI interpreta e propone; non autorizza e non scrive.

Fonte unica di queste regole: questo file. `CLAUDE.md` lo importa, i file
annidati lo specializzano, `.codex/agents/` e `.claude/agents/` lo assumono.
Non duplicare una regola in un altro documento: linkarla.

## Prima di scrivere codice

Leggere sempre, in quest'ordine:

1. [`docs/planning/CURRENT_MILESTONE.md`](docs/planning/CURRENT_MILESTONE.md) — l'unico perimetro autorizzato;
2. gli invarianti qui sotto;
3. l'`AGENTS.md` più vicino ai file che modifichi.

Tutto il resto si legge **su necessità**, non per abitudine:

| Se devi…                          | Apri                                                                                     | Non aprire            |
| --------------------------------- | ---------------------------------------------------------------------------------------- | --------------------- |
| capire cosa fa il prodotto        | [`docs/PROJECT.md`](docs/PROJECT.md)                                                     | roadmap e master plan |
| attraversare un confine fra layer | [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)                 | i piani di fase       |
| sapere dove va un file            | [`docs/architecture/REPOSITORY_STRUCTURE.md`](docs/architecture/REPOSITORY_STRUCTURE.md) | —                     |
| implementare la fase attiva       | il solo file in [`docs/planning/phases/`](docs/planning/phases/README.md) di quella fase | le altre fasi         |
| chiudere una feature              | [`docs/planning/DEFINITION_OF_DONE.md`](docs/planning/DEFINITION_OF_DONE.md)             | RELEASE_CLOSURE       |
| capire _perché_ una cosa è così   | l'ADR pertinente in [`docs/decisions/`](docs/decisions/README.md)                        | tutti gli ADR         |
| scrivere o estendere test         | [`docs/TESTING.md`](docs/TESTING.md) + [`tests/AGENTS.md`](tests/AGENTS.md)              | —                     |
| diagnosticare un incidente        | il runbook della slice in [`docs/runbooks/`](docs/runbooks/)                             | —                     |
| assegnare lavoro a un subagente   | [`docs/agents/ORCHESTRATION.md`](docs/agents/ORCHESTRATION.md)                           | —                     |

L'indice completo con i costi di lettura è in [`docs/README.md`](docs/README.md).

## Invarianti non negoziabili

Violarli è un finding P0, anche se i test passano.

1. **Core senza AI.** Il prodotto deterministico compila e funziona senza provider configurato.
2. **Multi-tenancy dal giorno 1.** Ogni accesso tenant-scoped riceve `UserScope` o `SpaceScope` esplicito; mai query per ID nudo.
3. **Identità mappata.** Telegram `user_id` è identità esterna; il dominio usa un ID interno. Numero di telefono e username non sono chiavi identitarie.
4. **L'AI propone soltanto.** Un LLM produce solo `ActionProposal[]`. Flusso obbligatorio: schema strict → Zod → validator tenant/permessi → policy → domain service. La confidence del modello non autorizza nulla.
5. **Nessun dato sensibile nei log.** Mai segreti, token, prompt completi, contenuto personale o raw media. Solo ID, hash e codici.
6. **Media transitori.** Audio e immagini si eliminano dopo l'elaborazione, in `finally`. Conservare un originale richiede use case esplicito, cifratura, authorization e retention.
7. **Tempo corretto.** Date relative = timestamp del messaggio + data locale + timezone IANA dell'utente. Mai un offset fisso al posto di una timezone; mai DST implementato a mano.
8. **Denaro esatto.** Unità minori intere e valuta esplicita. Mai `float`. Gli split sommano esattamente all'importo.
9. **Write disciplinate.** Ogni write importante è autorizzata, idempotente, auditabile e — se reversibile — annullabile.
10. **Webhook sottile.** POST check, verifica secret, validazione JSON, dedupe, enqueue, risposta rapida. **Nessuna chiamata AI nel webhook o nel Cron.**
11. **Cron e Queue.** Il Cron fa claim atomico e pubblica job; la Queue consegna e classifica retry/dedupe. Trasporto at-least-once, **una sola esecuzione logica**.
12. **Planner deterministico.** Vincoli e slot sono calcolati dal codice. L'AI può solo normalizzare vincoli e spiegare il risultato.
13. **Google Calendar a livelli.** `EXPORT_ONLY` → reconcile/import → bidirezionale. D1 resta autorevole; mai last-write-wins cieco.
14. **Open Banking escluso.** Niente credenziali, provider, adapter, dipendenze o tabelle bancarie ([ADR-0009](docs/decisions/0009-no-open-banking.md)). L'import CSV manuale è un use case di dominio, non un'integrazione.

## Regole di implementazione

- **Architettura:** modular monolith. Niente microservizi o Cloudflare Workflow senza necessità misurata.
- **Dipendenze:** mai `latest`, range aperti o template `full`. Verificare la release corrente, fissare la versione esatta, aggiornare il lockfile. Non aggiungere una dipendenza di produzione quando una piccola implementazione nativa è più semplice e verificabile.
- **Stack fissato:** grammY per Telegram, Drizzle per schema/migration/query, Zod ai confini non fidati, `@js-temporal/polyfill` per il tempo. SQL diretto solo preparato, tenant-scoped, testato e motivato. `rrule` solo nella fase ricorrenze.
- **TypeScript strict:** niente `any`, cast non sicuri o check disabilitati senza un motivo di confine documentato. `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess` sono attivi: rispettarli, non aggirarli.
- **Errori:** tassonomia condivisa in `src/shared/errors.ts` e failure attese in stile `Result`. Mai stack trace all'utente, mai eccezioni del provider che risalgono i layer.
- **Determinismo:** clock, generatore di ID e adapter sono iniettati dove il test deve essere riproducibile.
- **Correlation ID:** propagato end-to-end attraverso webhook, Queue, AI, database e risposta Telegram.
- **Configurazione, non dominio:** nomi dei modelli AI, prezzi e fallback vivono in configurazione versionata.

## Struttura e budget dei moduli

Vedi [ADR-0022](docs/decisions/0022-module-structure-budgets.md) per il razionale.

- Un file supera **500 righe** solo con motivazione nel PR; a **800** va splittato prima di aggiungere altro.
- **Porte per slice, non barrel unico.** Una nuova slice definisce le sue porte in `src/application/ports/<slice>.ts`; non ingrandire un file di porte condiviso.
- **Parser per dominio.** Un nuovo comando Telegram aggiunge `src/application/commands/<dominio>.ts` e si registra; non allunga uno switch centrale.
- **Dipendenze non opzionali.** Una dipendenza `foo?:` in un contenitore di use case è un segnale di registry mancante, non una feature.
- **Un dominio non legge le tabelle di un altro.** I collegamenti cross-domain sono riferimenti tipizzati e tenant-scoped, introdotti dalla slice che li usa.
- **Niente scaffold speculativo.** Non creare file, tabelle o interfacce per fasi future.

## Ordine di lavoro

- Lavorare solo sulla milestone in `CURRENT_MILESTONE.md`. Definire soltanto i seam necessari a non bloccare il core.
- Per ogni decisione nuova o modificata, aggiungere o aggiornare un ADR in `docs/decisions/`.
- Aggiornare comportamento, test, documentazione e backlog **nello stesso ciclo**.
- Non dichiarare completa una feature finché i gate applicabili della Definition of Done non sono soddisfatti.
- Non creare risorse Cloudflare remote né eseguire deploy senza autorizzazione esplicita del proprietario.

## Verifica

Gate completo, identico alla CI:

```powershell
npm run validate
```

Durante il lavoro usare il comando più stretto (`npm run test:unit`,
`npm run test:integration -- <file>`, `npm run typecheck`) e riservare
`validate` alla chiusura. Aggiungere sempre:

| Se hai toccato…      | Aggiungi                                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| schema o migration   | migration test fresh/upgrade + test cross-tenant + `EXPLAIN QUERY PLAN` sulle query hot |
| tempo o ricorrenze   | casi DST, mezzanotte, date-only e property test                                         |
| denaro               | property test su minor unit e split                                                     |
| authorization o dati | test negativo cross-user/cross-space                                                    |
| retry, Queue o Cron  | test di duplicate delivery e partial failure                                            |
| AI (Phase C+)        | schema test, provider mock e benchmark smoke                                            |
| un bug               | prima il regression test che fallisce, poi il fix                                       |

## Uso degli agenti

- Delegare solo attività indipendenti e delimitate; **massimo tre subagenti simultanei**.
- Il main agent mantiene requisiti, decisioni, integrazione, ADR e risposta finale. Un subagente non apre una fase, non aggiunge dipendenze e non crea risorse remote.
- Un solo writer per insieme di file. I reviewer sono read-only e intervengono dopo che la modifica è stabile.
- Profili: `.claude/agents/` (Claude) e `.codex/agents/` (Codex), descritti in [`docs/agents/README.md`](docs/agents/README.md).
- Ogni subagente consegna secondo [`docs/agents/HANDOFF.md`](docs/agents/HANDOFF.md): esito, evidenze, file toccati, verifiche eseguite, rischi residui, decisioni richieste.

## Economia del contesto

Il contesto è la risorsa scarsa: la qualità cala quando si riempie di materiale
non pertinente.

- Aprire i documenti della tabella di routing, non l'intera `docs/`.
- Su un file oltre ~400 righe, cercare il simbolo (`grep`/ricerca strutturale) invece di leggerlo tutto.
- Delegare le esplorazioni ampie a un subagente read-only: consuma il suo contesto, non il tuo, e restituisce solo la conclusione.
- Nell'handoff sintetizzare: indicare il comando e l'esito, non incollare log interi.
- Una procedura ripetibile va in `.claude/skills/`, non in un documento caricato a ogni sessione.
- Preferire un file nuovo e mirato all'allungamento di un documento già grande.

## Code review

- **P0/P1:** leakage cross-tenant, bypass di authorization, esposizione di segreti, write guidata direttamente dall'AI, query tenant-scoped senza owner/space, retry non idempotenti, reminder senza dedupe, data/ora su offset fisso, `float` sul denaro.
- Verificare che i fallback AI rispettino capability, privacy minima, budget e costo massimo.
- Richiedere un regression test per ogni bug corretto e un test security/property per ogni invariante coinvolto.
- Distinguere difetti confermati da ipotesi; citare file e simbolo.
- Ignorare le osservazioni stilistiche già coperte da Prettier ed ESLint.

## Tool di sviluppo (dev-only)

Ruflo e Graphify non sono dipendenze runtime del bot e non si installano finché
una task non li richiede esplicitamente. Vincoli in
[`docs/agents/ORCHESTRATION.md`](docs/agents/ORCHESTRATION.md).
