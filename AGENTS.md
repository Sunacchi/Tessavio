# Istruzioni di progetto per Codex

## Missione

Costruire un assistente personale Telegram multiutente e BYOK su Cloudflare Workers. Il database D1 è la fonte della verità. L'AI interpreta e propone; non autorizza e non scrive direttamente dati.

Prima di modificare codice o architettura, leggere:

1. `docs/PROJECT.md`;
2. `docs/architecture/ARCHITECTURE.md`;
3. `docs/planning/CURRENT_MILESTONE.md`;
4. `docs/planning/DEFINITION_OF_DONE.md`;
5. l'`AGENTS.md` più vicino ai file interessati.

## Invarianti non negoziabili

- Il core deve funzionare senza AI.
- Multi-tenancy dal primo giorno: ogni accesso usa `UserScope` o `SpaceScope`; mai query di entità tenant-scoped solo per ID.
- Telegram `user_id` è identità esterna; il dominio usa un ID utente interno. Numero di telefono e username non sono chiavi identitarie.
- Un LLM produce soltanto `ActionProposal[]` strutturate. Il flusso è: schema -> validator -> policy -> domain service.
- Nessun segreto, token, prompt completo, dato personale in chiaro o raw media nei log.
- Audio e immagini sono transitori per default e vengono eliminati dopo l'elaborazione.
- Date relative usano timestamp del messaggio, data locale e timezone IANA dell'utente. Non implementare DST manualmente.
- Denaro in unità minori intere; mai `float`.
- Ogni write importante è autorizzata, idempotente, auditabile e, se reversibile, annullabile.
- Il webhook Telegram fa solo POST check, verifica secret, validazione JSON, dedupe, enqueue e risposta rapida. Nessuna chiamata AI nel webhook.
- Cron effettua claim atomico dei reminder e pubblica job; la Queue invia e gestisce retry/deduplica.
- Il planner applica vincoli e assegna slot in modo deterministico. L'AI può normalizzare vincoli e spiegare il risultato.
- Google Calendar è opzionale e inizialmente `EXPORT_ONLY`; D1 resta autorevole.

## Regole di implementazione

- Architettura: modular monolith. Non introdurre microservizi o workflow Cloudflare prima di una necessità misurata.
- Dipendenze: nessun `latest`, range aperto o template `full`. Verificare la release corrente, fissare la versione esatta e lasciare il lockfile aggiornato.
- Non aggiungere una dipendenza di produzione quando una piccola implementazione nativa è più semplice e verificabile.
- Usare grammY come candidato Telegram principale; Hono solo se semplifica concretamente il routing.
- Usare Drizzle per typing, schema, migration e query ordinarie; SQL diretto solo preparato, tenant-scoped, testato e motivato.
- Usare Zod ai confini non fidati. Lo schema dell'AI deve essere strict e validato di nuovo lato server.
- Scegliere un solo polyfill Temporal. Aggiungere `rrule` soltanto nella fase ricorrenze.
- Nomi di modelli AI e prezzi sono configurazione/versioned policy, mai logica di dominio.
- Riutilizzare il correlation ID attraverso webhook, queue, AI, database e risposta Telegram.
- Conservare gli errori in una tassonomia stabile; non mostrare stack trace agli utenti.

## Ordine di lavoro

- Lavorare solo sulla milestone indicata in `docs/planning/CURRENT_MILESTONE.md`.
- Evitare scaffold speculativo delle fasi successive; definire soltanto seam/interfacce necessarie a non bloccare il core.
- Per una decisione nuova o modificata, aggiungere o aggiornare un ADR in `docs/decisions/`.
- Aggiornare backlog, documentazione e test insieme al comportamento.
- Non dichiarare una feature completa finché tutti i gate applicabili della Definition of Done non sono soddisfatti.

## Verifica minima

Quando gli script esisteranno, eseguire almeno: format/lint, typecheck, unit test e test mirati. Per schema o migration aggiungere validation e test cross-tenant; per AI aggiungere schema test e benchmark smoke; per tempo aggiungere casi DST e property test.

## Uso degli agenti

- Delegare soltanto attività indipendenti e delimitate; massimo tre subagenti simultanei.
- Il main agent mantiene requisiti, decisioni, integrazione e risposta finale.
- Preferire agenti read-only per esplorazione, sicurezza e review. Evitare scritture parallele sugli stessi file.
- Usare i profili in `.codex/agents/` secondo `docs/agents/README.md`.
- Ogni subagente restituisce: evidenze, file toccati, verifiche eseguite, rischi residui e decisioni richieste.

## Tool di sviluppo

- Ruflo è orchestrazione dev-only tramite adapter Codex, mai dipendenza runtime del bot. Prima dell'installazione verificare le versioni correnti e fissare adapter e core esattamente; vietati `latest` e template `full`. Il loop deve restare bounded e persistente tramite stato su file.
- Graphify è dev-only e si usa soltanto dopo una prima vertical slice o alla fine di milestone/refactor. Non eseguirlo su repository vuoto né a ogni iterazione.
- Non aggiungere Ruflo o Graphify finché una task non ne richiede esplicitamente l'uso.

## Code Review Rules

- Segnalare come P0/P1 ogni possibile leakage cross-tenant, bypass di authorization, esposizione di segreti o write guidata direttamente dall'AI.
- Segnalare query tenant-scoped prive di owner/space scope, retry non idempotenti, reminder senza dedupe e gestione data/ora basata su offset fisso.
- Verificare che i fallback AI rispettino capability, privacy minima, budget e costo massimo.
- Richiedere test di regressione per ogni bug corretto e test security/property per gli invarianti coinvolti.
- Ignorare osservazioni puramente stilistiche già coperte da formatter o lint.
