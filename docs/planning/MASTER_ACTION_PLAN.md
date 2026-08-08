# Master action plan — dalla baseline al prodotto Tessavio

## Scopo e stato

Questo documento è la mappa operativa end-to-end del repository. Traduce la
[roadmap](ROADMAP.md) in una sequenza verificabile, descrive il valore percepito
dall'utente e indica al main agent come assegnare lavoro bounded agli agenti di
coding e review.

Stato verificato il 2026-08-08:

- [x] A0 documentale completata: visione, architettura, ADR, policy e profili agente;
- [x] repository Git inizializzato, remote collegato e baseline A1 committata;
- [x] toolchain/package manifest/lockfile presenti;
- [x] codice applicativo, migration e test presenti;
- [x] A1 Foundation revalidata: seam Queue deterministico, delivery Telegram
      definite/ambiguous, regression test, documentazione, `npm run validate` e
      audit production dependencies verdi;
- [x] requisiti di prodotto estesi assegnati a milestone concrete A-O;
- [ ] release beta chiusa secondo la sezione finale di questo piano.

La sola milestone autorizzata all'implementazione è sempre quella indicata in
[CURRENT_MILESTONE.md](CURRENT_MILESTONE.md). Le fasi future qui sotto sono
impegni di prodotto ordinati: definiscono outcome, UX, rischi e gate, ma non autorizzano
scaffold, dipendenze o API premature. Quando una fase diventa attiva, il main
agent deve sostituire la milestone corrente con un piano esecutivo della sola
vertical slice successiva.

## Cosa significa “chiusura”

Il repository è chiuso per la beta quando il prodotto copre tutte le fasi rese
obbligatorie dallo scope beta approvato, tutti i
gate applicabili della [Definition of Done](DEFINITION_OF_DONE.md) sono verdi, la
release è riproducibile, la recovery è provata e ciò che non entra nella beta è
esplicitamente spostato nel backlog futuro. Il deploy o la creazione di risorse
remote richiedono comunque autorizzazione esplicita del proprietario.

La chiusura della core beta non cancella le milestone J-N già approvate: indica
solo che il relativo release gate è verificato. La chiusura del prodotto esteso
arriva con O. In entrambi i casi non devono restare attività implicite, rischi
critici non accettati o criteri di uscita non verificati nello scope dichiarato.

La chiusura non significa che il software non riceverà manutenzione.

## Decision register del main agent

Queste decisioni non vanno lasciate a un writer. Il main agent raccoglie
evidenze, propone la scelta al proprietario quando cambia prodotto/scope e
registra in ADR le conseguenze durevoli.

- [x] **Source control:** inizializzato Git `main` e collegato il remote
      corretto prima delle implementazioni; non inventare destinazione o history.
- [x] **Delivery semantics:** adottato trasporto
      at-least-once con una sola esecuzione logica tramite chiavi stabili,
      inbox/effect ledger e recovery; non promettere Queue/Telegram exactly-once
      ([ADR-0007](../decisions/0007-at-least-once-logical-idempotency.md)).
- [x] **Comando A1:** usare `/start`, così la Foundation prova identità e
      authorization senza trascinare timezone/Temporal dentro la slice.
- [x] **Posizione A2:** fondere la reminder infrastructure nella
      prima vertical slice reminder della Phase B, senza uno scaffold orizzontale.
- [x] **Scope di prodotto:** Inbox, finanze, briefing, documenti, persone, casa,
      planner, Google Calendar, viaggi e benessere sono assegnati a milestone
      concrete; la core beta termina in I e il prodotto esteso in O.
- [x] **Open Banking:** escluso definitivamente con ADR-0009; CSV solo manuale.
- [x] **Inbox/confini:** acquisizione comune senza duplicare i domini (ADR-0010).
- [x] **Google Calendar:** H1 export, H2 reconcile/import e H3 bidirezionale,
      sempre con D1 autorevole (ADR-0011).
- [x] **Retention A1:** fissate durate e recovery per inbox/dedupe,
      job/effect/delivery ledger, audit e identità in ADR-0008.
- [ ] **Retention futura:** fissare durate e purge per ActionProposal, media,
      Undo/soft-delete, OAuth state, log, export e backup.
- [ ] **OAuth/crypto:** prima di C approvare TTL, redirect allowlist, binding,
      consumo atomico, ciphertext format/AAD, KEK rotation e revoca.
- [ ] **Sharing/delete:** prima di F/I approvare role matrix, ultimo owner,
      private-to-shared e trattamento di dati condivisi, audit e backup alla delete.
- [ ] **Go/no-go:** prima di I3 approvare SLO, carico, RPO/RTO, autorità di firma e
      regola sui finding residui.

## Invarianti che ogni checkbox deve preservare

- [ ] il flusso core continua a funzionare in modalità `NO_AI`;
- [ ] ogni accesso tenant-scoped riceve `UserScope` o `SpaceScope` esplicito;
- [ ] Telegram `user_id` viene risolto in un ID interno prima del dominio;
- [ ] l'AI può produrre solo `ActionProposal[]`, mai autorizzare o scrivere;
- [ ] ogni write è autorizzata, idempotente, auditabile e, se reversibile, annullabile;
- [ ] timestamp, date locali e timezone IANA conservano la semantica temporale;
- [ ] il denaro usa unità minori intere e valuta esplicita;
- [ ] webhook, Queue e Cron mantengono correlation ID e confini di retry;
- [ ] log, fixture e benchmark non contengono segreti, prompt completi o dati personali;
- [ ] media raw e credenziali rispettano retention, cancellazione e cifratura definite;
- [ ] ogni nuova categoria persistita definisce retention, purge idempotente,
      isolamento tenant, legal hold applicabile e comportamento di backup/restore;
- [ ] nessuna dipendenza usa `latest` o range aperti e ogni API mutevole viene riverificata;
- [ ] nessuna fase introduce microservizi o Workflow senza evidenza misurata;
- [ ] il sync bidirezionale esiste solo nel gate H3 con conflict policy e loop prevention;
- [ ] nessun secret, provider, adapter, schema o dipendenza Open Banking.

## Flusso utente di destinazione

Questa è la storia che le vertical slice devono costruire senza salti.

1. **Primo contatto.** L'utente sceglie lingua/timezone e comprende modalità
   `NO_AI`, dati trattati e comandi disponibili.
2. **Core deterministico.** Eventi, task, reminder, turni, liste e finanze base
   funzionano con comandi, authorization, audit e Undo.
3. **Tessavio Inbox.** Testo, forward e link diventano comandi o proposte verso i
   domini; un input ambiguo genera una sola domanda mirata.
4. **Voce, immagini e documenti.** I media sono elaborati in modo transitorio e
   import multipli/incerti richiedono revisione.
5. **Planner.** Slot e riprogrammazioni sono calcolati deterministicamente,
   motivati e applicati solo dopo la policy prevista.
6. **Condivisione.** Membership e ruoli rendono esplicito cosa è privato o
   familiare/condiviso.
7. **Proattività.** Briefing configurabili rispettano quiet hours e dedupe e si
   arricchiscono solo dopo l'arrivo dei relativi domini.
8. **Calendario esterno.** Google Calendar passa da export a riconciliazione e
   sync bidirezionale controllata; D1 resta autorevole.
9. **Controllo e diritti.** Mini App, export, revoca e delete account usano
   sessioni brevi e purge verificabile.
10. **Memoria personale.** Documenti, persone e follow-up sono ricercabili e
    collegati senza duplicare eventi, task o finanze.
11. **Vita domestica e viaggi.** Casa, pasti e viaggi funzionano localmente prima
    delle integrazioni esterne.
12. **Benessere prudente.** Routine e reminder personali non diventano diagnosi,
    prescrizioni o trattamenti.

### Contratto UX comune

Ogni feature deve specificare e testare:

- [ ] testo iniziale che dica all'utente cosa è successo o cosa serve;
- [ ] riepilogo delle entità coinvolte, con data/ora locale e scope privato/condiviso;
- [ ] assunzioni e ambiguità visibili, senza inventare campi mancanti;
- [ ] `Conferma`, `Modifica` e `Annulla` per preview; `Annulla modifica` per write reversibili;
- [ ] token/callback brevi, scaduti in modo sicuro e legati a utente, scope e proposta;
- [ ] esito utile per errori temporanei, permanenti, duplicati e autorizzazione negata;
- [ ] fallback a comandi deterministici quando l'AI o un'integrazione è indisponibile;
- [ ] nessuna esposizione di stack trace, ID sensibili, token o contenuto di altri tenant.

## Metodo di orchestrazione

### Loop per ogni task

- [ ] il main agent legge `AGENTS.md`, milestone, DoD e istruzioni locali;
- [ ] seleziona il primo outcome non completato della sola milestone attiva;
- [ ] trasforma l'outcome in una task bounded usando
      [TASK_TEMPLATE.md](../agents/TASK_TEMPLATE.md);
- [ ] dichiara file/aree di ownership ed evita writer concorrenti sugli stessi file;
- [ ] riserva a sé requisiti, contratti cross-layer, decisioni di prodotto e ADR;
- [ ] usa al massimo tre subagenti simultanei e solo per lavoro indipendente;
- [ ] fa eseguire al writer i test mirati prima dell'handoff;
- [ ] dopo una modifica stabile richiede review read-only di qualità e, quando
      tocca dati/sicurezza, review avversariale dedicata;
- [ ] integra i finding, riesegue i gate completi e controlla il diff finale;
- [ ] aggiorna test, documenti, backlog, milestone e ADR nello stesso ciclo;
- [ ] per ogni schema change prova fresh/upgrade, compatibilità worker N-1/schema N,
      vincoli tenant, rollback/roll-forward e recovery dei dati cifrati/audit;
- [ ] produce un handoff conforme a [HANDOFF.md](../agents/HANDOFF.md);
- [ ] crea un commit atomico solo quando la slice è verde e lo scope è verificato.

### Scelta dell'agente

| Profilo                  | Assegnare quando                                            | Non delegare                 |
| ------------------------ | ----------------------------------------------------------- | ---------------------------- |
| `architect`              | confini, ADR, nuova milestone, contratti fra moduli         | implementazione              |
| `cloudflare_worker`      | `fetch`, `queue`, `scheduled`, bindings, Telegram transport | regole di dominio            |
| `domain_worker`          | use case deterministici, policy, audit, undo                | SDK/provider e deploy        |
| `ai_integrations_worker` | Phase C+, schema AI, router, OAuth, benchmark               | authorization finale o write |
| `data_security_reviewer` | schema, migration, tenancy, OAuth, crypto, privacy          | modifica file                |
| `quality_reviewer`       | DoD, edge case, retry, regressioni e release gate           | modifica file                |

Sonnet può essere usato come writer per le task delimitate; la qualità dipende
più dal brief che dal nome del modello. Ogni brief deve includere obiettivo
osservabile, file posseduti, invarianti rilevanti, out-of-scope, test richiesti e
condizione di arresto. Un agente non decide autonomamente di aprire la fase
successiva, aggiungere una dipendenza o creare risorse remote.

### Routing dei modelli

Il modello si sceglie per responsabilità, non si assegna automaticamente un solo
modello a tutta la fase. Gli identificativi disponibili e i relativi costi vanno
ricontrollati quando parte la task; il routing di responsabilità resta questo:

| Modello/classe                | Uso principale                                                                                                                               | Evitare                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Sol**                       | main orchestrator, contratti cross-layer, ADR, concorrenza/idempotenza, tenancy, authorization, crypto, integrazione finale e firma del gate | task meccaniche già completamente specificate                                          |
| **Sonnet**                    | writer predefinito: vertical slice bounded, CRUD/domain service, adapter, migration già progettata, test e bug fix con file ownership chiara | decidere scope, cambiare invarianti o auto-approvare la fase                           |
| **Terra o modello rapido**    | ricognizione read-only, aggiornamenti documentali meccanici, fixture sintetiche, link/checklist e modifiche locali a basso rischio           | security review finale, migration rischiosa, OAuth/crypto, planner o merge cross-layer |
| **Modello/strumento visuale** | verifica Mini App, responsive, accessibilità e flussi visivi dopo implementazione                                                            | autorizzazione, dati o decisioni di dominio                                            |

Regola pratica:

- [ ] usare **Sol** quando un errore può propagarsi fra moduli o violare un invariante;
- [ ] usare **Sonnet** quando contratto, scope, ownership e Done sono già congelati;
- [ ] usare un modello rapido solo se il risultato viene verificato da test o da
      Sol/Sonnet prima del merge;
- [ ] far tornare la task a Sol se emergono decisioni non previste, file condivisi,
      failure window distribuite o finding security;
- [ ] far eseguire la firma finale della fase a Sol, mai al writer che l'ha implementata.

### Routing consigliato per fase

| Fase                | Sol                                                            | Sonnet                                                              | Altri                                                                   |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **A1 Foundation**   | preflight, ADR, contratti inbox/effect, integrazione e gate    | toolchain, webhook, consumer, adapter D1/Telegram e test bounded    | modello rapido per inventario/link; reviewer security/quality read-only |
| **A2/B2 Reminder**  | state machine, lease/recovery, semantica delivery              | repository, Cron/Queue adapter, Telegram delivery e fault test      | modello rapido solo per fixture/documenti                               |
| **B Core**          | contract packet di ogni slice, tempo/Undo e integrazione       | writer principale per eventi, task, lavoro, spese, liste e report   | modello rapido per fixture e documentazione derivata                    |
| **C AI**            | `ActionProposal`, policy, OAuth/crypto, budget e gate privacy  | adapter OpenRouter, config, provider mock, benchmark harness e test | modello rapido per dataset sintetico, sempre revisionato                |
| **D Media**         | threat model, lifecycle/retention e integrazione pipeline      | download/STT/vision adapter, cleanup e test failure                 | strumenti media solo su fixture sintetiche                              |
| **E Planner**       | invarianti, algoritmo/contratti, preview/apply e property gate | implementazione pura dopo specifica, ottimizzazioni e test          | modello rapido per generare casi, non per giudicare correttezza         |
| **F Sharing**       | role matrix, tenancy, invite lifecycle e security gate         | repository/use case/UI Telegram bounded                             | modello rapido per matrice fixture, con review Sol                      |
| **G Proattività**   | contratti contributor, quiet hours, dedupe e policy UX         | query/report e delivery bounded                                     | reviewer privacy/quality su contenuto e ripetizioni                     |
| **H Google**        | OAuth, mapping/idempotenza, conflict policy e gate             | adapter Calendar, Queue/retry e provider test                       | modello rapido per fixture API sanificate                               |
| **I Mini App/beta** | trust boundary, export/delete, risk acceptance e go/no-go      | frontend, API contrattualizzate, fix bounded e regression test      | browser visuale + strumenti load/security                               |
| **J-N Domini**      | confini/link, lifecycle, scope e integrazione finale           | una vertical slice dominio alla volta                               | reviewer security/quality secondo sensibilità                           |
| **O Convergenza**   | ricerca cross-domain, release gate e risk acceptance           | fix bounded e prove end-to-end                                      | strumenti load/security; modello rapido solo per report                 |

### Protocollo obbligatorio di chiusura fase

Alla chiusura di ogni fase il main agent deve consegnare, anche quando l'utente
non lo richiede nuovamente:

```md
## Chiusura <fase>

- Esito: completata | non chiudibile
- Evidenze: test, migration, review, recovery e documenti
- Rischi residui: finding con owner oppure nessuno

## Prossimo passo

- Fase successiva: <ID e titolo>
- Modello primario consigliato: Sol | Sonnet | altro
- Modelli/agenti di supporto: <ruoli bounded>
- Perché: <rischio e tipo di lavoro in 1-3 frasi>
- Prima task: <obiettivo pronto da assegnare>
- Gate prima di partire: <decisioni o prerequisiti>
```

- [ ] non annunciare la fase successiva come attiva se il gate corrente non è verde;
- [ ] se la fase non è chiudibile, indicare Sol come orchestratore del recupero e
      Sonnet soltanto per eventuali fix già delimitati;
- [ ] aggiornare `CURRENT_MILESTONE.md` solo dopo la firma del gate;
- [ ] rivalutare il modello consigliato se lo scope della fase successiva cambia.

### Prompt base per un agente di coding

```text
Ruolo: <profilo>. Milestone attiva: <id e link>.
Obiettivo bounded: <un risultato osservabile>.
Ownership esclusiva: <directory/file>. Non sei solo nel repository: conserva le
modifiche altrui e segnala sovrapposizioni prima di editare.

Leggi AGENTS.md, i quattro documenti obbligatori e l'AGENTS.md più vicino.
Contratti già decisi: <input/output/errori/idempotency/scope>.
In scope: <azioni concrete>. Out of scope: <fasi/moduli/deploy/dipendenze>.
Test obbligatori: <unit/integration/security/property/regression>.
Done when: <criteri verificabili>.

Non cambiare architettura o scope per sbloccare il task: restituisci una decisione
richiesta al main agent. Consegna usando docs/agents/HANDOFF.md, elencando tutti i
file toccati, comandi eseguiti, rischi residui e assunzioni.
```

## Phase A — Foundation

### A1.0 — Baseline e decision gate

Valore: rendere il repository riproducibile prima di affidare implementazioni a
writer diversi.

- [x] inizializzare Git nella directory esatta del progetto e creare una baseline
      solo dopo aver verificato che non contenga segreti o artefatti locali;
- [x] confermare con il proprietario il package manager e documentarne la versione;
- [x] consultare fonti ufficiali e fissare versioni esatte compatibili di Node/tooling,
      Wrangler, TypeScript, Vitest, grammY, Zod e Drizzle;
- [x] eseguire uno spike minimo native Fetch vs Hono e registrare la decisione;
- [x] confermare che A1 non richiede Temporal; il probe sul runtime Workers
      fissato non espone il global e la scelta dell'eventuale polyfill resta
      just-in-time per B1.2;
- [x] definire ownership tra migration Drizzle e SQL diretto preparato;
- [x] definire la strategia locale per D1 e Queue, con fake/in-memory solo dove
      conserva la semantica che il test deve provare;
- [x] approvare un ADR che descriva i crash window D1 -> Queue e Telegram -> ledger,
      la semantica at-least-once e la recovery senza dichiarare exactly-once;
- [x] classificare provisioning identità, audit e Undo applicability e fissare la
      retention dei record A1;
- [x] aggiungere o aggiornare un ADR per le decisioni durevoli emerse;
- [x] aggiornare `.gitignore`, esempi env senza valori reali e runbook di bootstrap;
- [x] verificare che install e controlli partano da clone pulito.

Agent route: main agent decide; `architect` confronta le opzioni; nessun writer
installa prima della decisione. Per versioni/API si usano fonti ufficiali correnti.

### A1.1 — Toolchain e struttura minima

- [x] creare manifest e lockfile con versioni esatte;
- [x] abilitare TypeScript strict senza `any` o bypass globali;
- [x] configurare Wrangler con ambienti locali/staging/prod separati e binding tipizzati;
- [x] configurare format, lint, typecheck, unit, integration e security test;
- [x] creare solo i moduli necessari alla slice, rispettando la direzione delle dipendenze;
- [x] aggiungere fake clock, ID generator e adapter di test deterministici;
- [x] documentare comandi Windows/PowerShell e CI-equivalent nel runbook;
- [x] provare installazione e suite vuota/minima da ambiente pulito.

Agent route: `cloudflare_worker` possiede config Worker/toolchain; il main agent
possiede contratti e dipendenze; `quality_reviewer` controlla riproducibilità.

### A1.2 — Schema iniziale, identità e deduplica

- [x] modellare utenti interni e identità Telegram separatamente;
- [x] modellare la deduplica di `update_id` con vincolo univoco e stato necessario;
- [x] includere timestamp, correlation/idempotency metadata senza contenuto personale;
- [x] creare migration versionata, additive e riproducibile;
- [x] predisporre repository che richiedono `UserScope` esplicito;
- [x] definire mapping create-or-resolve Telegram identity -> internal user ID;
- [x] testare race/duplicati e accesso cross-user negativo;
- [x] documentare provisioning D1 dev/staging/prod con giurisdizione EU e recovery;
- [x] validare migration forward su database vuoto e compatibilità sullo stato precedente.

Agent route: `domain_worker` definisce contratto identità; `cloudflare_worker`
implementa adapter D1 se assegnato separatamente; `data_security_reviewer` chiude il gate.

### A1.3 — Contratti della vertical slice

- [x] definire envelope Queue versionato con job ID, correlation ID, timestamp,
      attempt e idempotency key;
- [x] definire tassonomia errori stabile: invalid input, unauthorized, duplicate,
      retryable external, permanent external e internal redacted;
- [x] definire porte per update dedupe, identity, authorization e Telegram reply;
- [x] definire ordine applicativo: identity -> authorization -> idempotency ->
      validation -> domain -> persistence -> audit/undo -> notification;
- [x] garantire che mutation e audit siano atomici nella stessa unità supportata o
      coordinati da un protocollo durevole; un audit failure non lascia write invisibili;
- [x] definire semantica di ack/retry per impedire doppia domain write/audit e
      gestire la reply secondo il delivery ledger e la policy dell'ADR-0007;
- [x] definire stati durevoli inbox/effect/delivery, lease e recovery per il crash
      dopo dedupe ma prima dell'enqueue e dopo effetto ma prima dell'ack;
- [x] accettare e documentare l'esito ambiguo di un side effect Telegram: evitare
      sempre doppie write; mitigare la doppia reply senza fingere atomicità remota;
- [x] definire il testo e il comportamento utente del comando `/start` minimo;
- [x] approvare i contratti prima che writer diversi tocchino i due lati.

Agent route: main agent + `architect`; i writer ricevono i contratti congelati.

### A1.4 — Webhook Telegram rapido e sicuro

- [x] accettare solo `POST` sul percorso esatto;
- [x] verificare il secret Telegram con rifiuto sicuro;
- [x] applicare limiti e validazione Zod all'input non fidato;
- [x] applicare una baseline configurabile di size, rate e concurrency limit prima
      del lavoro costoso; la calibrazione sotto carico resta in Phase I;
- [x] derivare/preservare correlation ID senza fidarsi di valori client;
- [x] registrare/claimare durevolmente `update_id` e lo stato inbox prima
      dell'enqueue, con recovery se il publish fallisce;
- [x] pubblicare `INBOUND_MESSAGE` con job/effect key stabili: sono ammesse più
      enqueue fisiche, ma una sola esecuzione logica;
- [x] non chiamare Telegram downstream, AI o logica di dominio nel webhook;
- [x] non loggare header, testo del messaggio, username o payload raw;
- [x] testare metodo errato, secret assente/errato, JSON invalido, update non
      supportato, oversized/rate-limited, duplicato e failure di enqueue.

UX: Telegram non mostra errori tecnici del webhook. Per update accettati la
risposta applicativa arriva dal consumer; per payload non supportati il consumer
può inviare un messaggio breve e deterministico.

Agent route: `cloudflare_worker`; review `data_security_reviewer`.

### A1.5 — Consumer, authorization e `/start`

- [x] validare nuovamente l'envelope come input non fidato;
- [x] risolvere/creare l'utente interno a partire dall'identità Telegram;
- [x] ricostruire `UserScope` e chiamare sempre l'authorization seam;
- [x] eseguire `/start` deterministicamente e senza provider AI;
- [x] persistire gli effetti una sola volta per idempotency key;
- [x] emettere la reply tramite adapter Telegram mockabile e delivery ledger,
      senza rieseguire il dominio quando l'esito remoto è ambiguo;
- [x] registrare audit/correlation metadata applicabili senza dati personali;
- [x] classificare errori retryable/permanent e gestire partial failure;
- [x] impedire che un retry dopo write ma prima della reply ripeta la write;
- [x] produrre un messaggio di benvenuto utile, che anticipi privacy, modalità
      deterministica e prossimo passo senza promettere feature future attive.

Agent route: `domain_worker` possiede use case/porte; `cloudflare_worker` possiede
consumer/adapter; il main agent integra senza writer concorrenti.

### A1.6 — Logging, osservabilità e failure UX

- [x] usare log JSON con event code, correlation/job ID, stato e latency; per
      correlare un utente usare ID operativo opaco o HMAC keyed/ruotabile con
      retention, mai hash diretto del Telegram `user_id`;
- [x] centralizzare redaction e serializzazione errori;
- [x] provare con test automatico che secret/payload/contenuti non compaiano nei log;
- [x] distinguere metricamente duplicate, invalid, retry, permanent e success;
- [x] definire cosa può essere mostrato all'utente per ogni classe di errore;
- [x] documentare diagnosi locale senza credenziali prod;
- [x] mantenere lo stesso correlation ID da webhook a Queue, D1 e reply.

### A1.7 — Test e uscita A1

- [x] unit test di validator, error mapping, identity e authorization;
- [x] integration test webhook -> Queue -> D1/repository -> reply mock;
- [x] test di update duplicato e replay fisico: una sola esecuzione/domain effect;
      la reply rispetta ledger e policy anche con outcome remoto ambiguo;
- [x] test di queue retry nei punti di failure rilevanti;
- [x] fault injection dopo dedupe, enqueue, domain commit, Telegram send e ack;
- [x] test negativo user A/user B su ogni repository tenant-scoped introdotto;
- [x] test secret/payload invalidi e secret-log scanning;
- [x] validation della migration e del provisioning documentato;
- [x] runbook di recovery per inbox bloccata, poison message e reply ambigua;
- [x] format, lint, typecheck, unit, integration e security tutti verdi;
- [x] review read-only con zero finding P0/P1 aperti;
- [x] aggiornare README, runbook, backlog, milestone, ADR e checkbox;
- [x] eseguire una demo locale riproducibile del caso felice e del duplicato;
- [x] attivare la prossima milestone solo dopo firma del main agent su A1 e
      decisione esplicita sulla posizione A2/B2.

### B2 — Reminder infrastructure (Phase B, non ancora attiva)

Valore utente futuro: un reminder esplicito attraversa creazione, claim e delivery
senza duplicare l'effetto logico anche con Cron, Queue e Telegram soggetti a retry.
ADR-0008 la inserisce nella Phase B come vertical slice completa, senza
infrastruttura isolata. Non introdurre parsing AI.

- [x] registrare il lavoro come B2 e correggere roadmap/backlog;
- [ ] attivare la milestone e dettagliare creazione, query, claim e delivery end-to-end;
- [ ] definire state machine reminder e transizioni legali;
- [ ] introdurre schema/indici tenant-scoped e migration versionata;
- [ ] implementare claim atomico `pending -> claimed` per reminder dovuti;
- [ ] pubblicare `SEND_NOTIFICATION` soltanto per righe effettivamente claimed,
      ammettendo replay fisici con una sola esecuzione logica;
- [ ] implementare delivery con `dedupe_key` univoca;
- [ ] classificare failure Telegram temporanee/permanenti e retry bounded;
- [ ] gestire crash prima/dopo enqueue e prima/dopo invio senza duplicare domain
      effects; l'invio esterno segue la policy esplicita del punto successivo;
- [ ] documentare il crash window dell'invio esterno e la policy at-most/at-least-once
      osservabile, senza promettere atomicità fra Telegram e D1;
- [ ] aggiungere metriche su due, claimed, sent, retry, dead/permanent;
- [ ] aggiungere test concorrenza, duplicate delivery, recovery e cross-tenant;
- [ ] documentare recovery di reminder stuck e rollback migration;
- [ ] chiudere i gate prima di B3 e delle slice B dipendenti.

Agent route: main agent/state machine; `domain_worker` regole; `cloudflare_worker`
Cron/Queue/delivery; review sicurezza e qualità dopo integrazione.

## Phase B — Core Product, interamente deterministica

### Gate di ingresso e preparazione just-in-time

- [x] A1 completata senza finding critici e posizione A2/B2 decisa;
- [x] attivare una sola vertical slice B alla volta: B1 dal 2026-08-08;
- [ ] scrivere scenari utente normali, ambigui, duplicate, unauthorized e Undo;
- [ ] definire modello dati minimo, porte e policy prima degli adapter;
- [ ] decidere per ogni entità private-by-default e futura condivisione esplicita;
- [ ] introdurre Temporal/recurrence solo quando la slice lo richiede davvero;
- [x] aggiornare milestone e backlog senza generare scaffold delle slice successive.

### Sequenza di valore

- [ ] **B1 Preferenze + agenda one-off.** Lingua, timezone IANA, formato ora,
      valuta/privacy, eventi one-off, date-only vs instant e viste `/oggi`/`/domani`;
      nessun default temporale inventato.
- [ ] **B2 Reminder end-to-end.** Creazione/query esplicite, state machine,
      leased claim, delivery ledger, retry/recovery, timezone/DST e infrastruttura A2.
- [ ] **B3 Task.** Inbox task, scadenze date-only o temporali, stato/priorità
      espliciti, completamento idempotente, riapertura e Undo.
- [ ] **B4 Lavoro.** Turni pianificati separati dai consuntivi, pause e regole
      data-driven; attraversamento mezzanotte e report verificabili.
- [ ] **B5 Finanze base.** Spese/entrate, minor unit, valuta, data, categoria,
      esercente/note/metodo facoltativi, correzione/delete/Undo e totali senza `float`.
- [ ] **B6 Liste, note e recurrence minima.** Liste/note private e item idempotenti; routine o
      ricorrenze solo se lo scope beta le conferma e con ora locale/timezone preservate.
- [ ] **B7 Report base.** Query deterministiche per agenda, task, lavoro e spese;
      periodi/timezone espliciti, provenance dei totali, CSV export base e zero dipendenza AI.

### UX e criteri di uscita B

- [ ] ogni feature è utilizzabile tramite comandi/scorciatoie documentate;
- [ ] `/oggi` produce una vista coerente di eventi, task, turni e reminder;
- [ ] input mancanti non vengono inferiti silenziosamente;
- [ ] azioni semplici eseguono con Undo; bulk/distruttive mostrano preview;
- [ ] ogni mutation path supera idempotency, audit, authorization e negative test;
- [ ] audit e mutation sono atomici o coordinati durevolmente; Undo è user/scope-bound,
      single-use, con TTL/version check e test cross-user, replay e stale resource;
- [ ] retention/purge delle categorie B usa fake clock, è idempotente e non attraversa tenant;
- [ ] tempo/denaro/recurrence applicano i property test pertinenti;
- [ ] report e viste non leggono dati di altri utenti;
- [ ] il prodotto B supera una demo completa con provider AI assente.

Agent route per ogni slice: `architect` solo al kickoff se cambia contratto;
`domain_worker` è il writer principale; `cloudflare_worker` aggiunge presentazione
Telegram/adapter dopo il contratto; reviewer read-only chiudono la slice.

## Phase C — AI Layer opzionale e BYOK

### Risultato utente

L'utente può collegare OpenRouter fuori dalla chat e scrivere richieste naturali.
Il modello restituisce proposte, mentre validazione, permessi, policy, preview,
write, audit e Undo rimangono software deterministico.

- [ ] attivare C e definire dataset/metriche baseline prima di scegliere modelli;
- [ ] definire union strict e versionata di `ActionProposal[]` per sole azioni B;
- [ ] generare JSON Schema e riconvalidare con Zod lato server;
- [ ] implementare validator semantico per scope, permessi, date, range,
      duplicati, conflitti, assunzioni e operazioni bulk/distruttive;
- [ ] implementare confirmation policy deterministica: execute+Undo vs preview;
- [ ] rendere idempotente proposal execution anche con retry provider/Queue;
- [ ] definire adapter provider-agnostic e capability T0/T1/T2/T3/T-STT;
- [ ] implementare modalità `NO_AI` come percorso di prima classe;
- [ ] implementare OAuth OpenRouter PKCE S256 con sessione opaca, one-time,
      user-bound e a scadenza breve; la key risultante è una credenziale
      OpenRouter user-controlled, non una chiave provider BYOK; nessuna API key
      nella chat;
- [ ] cifrare credenziali con envelope encryption, nonce unico e versionamento;
- [ ] implementare uso/budget, hard limit provider e max cost per operation separati;
- [ ] configurare model policy/fallback per capability, privacy, costo e disponibilità;
- [ ] minimizzare il contesto e impedire prompt/credential logging;
- [ ] aggiungere circuit breaker e fallback solo privacy-equivalente e sotto cap;
- [ ] creare benchmark sintetico italiano: multi-intent, date ambigue, turni,
      false-action rate, schema validity, latency e cost;
- [ ] aggiungere test schema, prompt injection, replay OAuth, budget race,
      provider timeout, output invalido e AI-unavailable;
- [ ] testare consumo OAuth concorrente single-use, wrong user/provider/redirect,
      PKCE mismatch, ciphertext swap cross-tenant/tamper/versione e nonce reuse;
- [ ] validare ogni migration C con worker N-1/schema N, recovery e preservazione
      dei ciphertext/version metadata;
- [ ] eseguire canary controllato prima di promuovere modello/prompt/schema;
- [ ] chiudere C dimostrando che nessuna risposta AI può bypassare policy o dominio.
- [ ] introdurre C3 Tessavio Inbox testuale per messaggi, forward e link con
      provenance minima, routing multi-intent e idempotency key per proposta;
- [ ] verificare che l'Inbox non duplichi entità o regole dei domini;
- [ ] porre una domanda breve su campi essenziali ambigui ed eseguire con Undo
      solo azioni non ambigue, reversibili e low-risk.

UX obbligatoria: `/ai` mostra stato e modalità; il collegamento apre un flusso web;
ogni proposta mostra ciò che verrà modificato; output invalido produce recovery
utile o comando esplicito, mai una write “best effort”.

Agent route: main agent congela schema/policy; `ai_integrations_worker` implementa
adapter/OAuth/benchmark; `domain_worker` possiede validator/executor deterministico;
`data_security_reviewer` e `quality_reviewer` chiudono i gate.

## Phase D — Voice + Vision transitori

- [ ] definire threat model, limiti dimensione/tipo/durata e retention prima del download;
- [ ] scaricare media Telegram solo nel consumer, mai nel webhook;
- [ ] usare storage transitorio e cancellazione in `finally` anche su timeout/errori;
- [ ] implementare STT come capability dedicata con testo revisionabile;
- [ ] passare la trascrizione allo stesso pipeline `ActionProposal` del testo;
- [ ] implementare vision con extraction strutturata e provenance per elemento;
- [ ] richiedere preview obbligatoria per batch, immagini con più entità o bassa certezza;
- [ ] impedire persistenza raw media e logging di URL/file/payload;
- [ ] applicare budget, privacy e fallback capability-aware anche ai media;
- [ ] testare formati non validi, file eccessivo, zip/bomb-like input, timeout,
      cancellazione, partial extraction e doppio delivery;
- [ ] aggiornare benchmark con voce italiana, screenshot e immagini sintetiche;
- [ ] verificare automaticamente che media e riferimenti transitori siano eliminati.
- [ ] validare migration D eventuali e lifecycle/purge dei soli metadata consentiti.
- [ ] aggiungere D3 per PDF/documenti supportati, ricevute, scontrini, bollette e
      prenotazioni con allowlist, limiti, parser bounded e routing ai domini;
- [ ] separare extraction transitoria dall'eventuale archivio cifrato J.

UX: l'utente vede “sto elaborando” solo quando utile, può correggere trascrizione o
righe estratte e conferma sempre le importazioni multiple prima della write.

## Phase E — Planner deterministico

- [ ] definire input normalizzati: finestra, durata, precedenze, blocchi,
      disponibilità, preferenze e hard/soft constraints;
- [ ] chiedere la durata mancante o proporla come assunzione revisionabile e
      dividere task grandi in passi senza applicarli automaticamente;
- [ ] costruire la vista deterministica degli impegni da D1 con timezone corretta;
- [ ] implementare conflict detector e allocatore senza dipendenza AI;
- [ ] distinguere piano impossibile, parziale e completo con motivazioni verificabili;
- [ ] applicare un limite di carico e rispettare turni, sonno, impegni e preferenze;
- [ ] permettere all'AI solo normalizzazione vincoli e spiegazione, mai allocazione finale;
- [ ] mostrare preview con spostamenti, conflitti, assunzioni e scope;
- [ ] applicare il piano in transazione/idempotency boundary e produrre Undo coerente;
- [ ] gestire modifica concorrente tra preview e apply con stale-version rejection;
- [ ] riprogrammare incomplete conservando il motivo e richiedendo conferma per
      modifiche significative;
- [ ] aggiungere property test per overlap, finestre, precedenze, durata e DST;
- [ ] aggiungere dataset planner e metriche constraint-compliance/usefulness;
- [ ] dimostrare identico risultato deterministico a parità di input/clock/config.
- [ ] validare migration E eventuali con compatibilità N-1/N e recovery.

UX: “pianificami la settimana” restituisce un piano revisionabile; se i vincoli non
stanno nel tempo disponibile il sistema spiega cosa resta fuori e non forza slot.

## Phase F — Multiuser Sharing

- [ ] definire spazi, membership, inviti, ruoli e capability matrix in un ADR;
- [ ] mantenere dati esistenti privati senza migrazione implicita;
- [ ] implementare inviti one-time, user-bound/recipient-bound, expiring e revocabili;
- [ ] richiedere `SpaceScope { userId, spaceId }` per ogni repository condiviso;
- [ ] verificare membership, ruolo e resource scope a ogni read/write;
- [ ] introdurre prima una singola vertical slice condivisa (lista o evento);
- [ ] aggiungere in F2 calendario familiare e attività/faccende assegnate;
- [ ] aggiungere in F3 spese condivise, split, debiti e crediti registrati in
      minor unit, senza disporre pagamenti;
- [ ] rendere sempre visibile nel messaggio se l'azione è privata o condivisa;
- [ ] richiedere preview per azioni bulk/condivise e auditare l'attore reale;
- [ ] gestire leave, revoke, ultimo owner, delete space e risorse orfane;
- [ ] testare role downgrade, invito riusato/forgiato, callback di altro utente,
      space mismatch e non-visibilità dei dati privati;
- [ ] aggiungere indici membership/space e query-plan evidence per hot path;
- [ ] validare migration F con worker N-1/schema N e test su owner/space non null;
- [ ] chiudere con review security senza leakage P0/P1.

## Phase G — Briefing e assistenza proattiva

- [ ] introdurre prima G1 con preferenze contenuto/orario/frequenza, quiet hours e
      briefing mattutino su soli domini B completati;
- [ ] rendere il riepilogo serale opt-in e separato dal briefing mattutino;
- [ ] comporre eventi, task, scadenze, turni e reminder tramite porte applicative
      autorizzate, senza query cross-domain libere;
- [ ] aggiungere G2 settimanale/mensile usando soltanto i domini B effettivamente
      completati; non richiedere spese programmate, forecast o capability K1-K3;
- [ ] usare schedule/claim/delivery dedupe per una sola notifica logica e gestire
      late delivery, retry e cambio preferenze concorrente;
- [ ] definire tono conciso e non ansiogeno; nessun dettaglio sensibile superfluo;
- [ ] far degradare un contributor senza bloccare o duplicare l'intero briefing;
- [ ] in G3 definire soltanto il contratto bounded e tipizzato dei contributor,
      con isolamento, timeout e graceful degradation; non attivare né anticipare
      documenti, persone, casa, viaggi o benessere;
- [ ] testare quiet hours, DST, duplicate Cron/Queue, contributor failure,
      opt-out e non-visibilità cross-tenant;
- [ ] validare schema/migration/recovery e retention dei delivery snapshot G.

## Phase H — Google Calendar a livelli

### H1 — Collegamento ed export controllato

- [ ] applicare ADR-0011: D1 autorevole, mapping stabile e niente last-write-wins;
- [ ] richiedere scope OAuth minimi e sessioni state/PKCE opache, one-time e sicure;
- [ ] cifrare/versionare token e supportare revoca/disconnessione;
- [ ] modellare account, calendario scelto e mapping local/external ID sempre
      tenant/account/calendar scoped;
- [ ] registrare outbox nello stesso boundary della mutation locale e applicare
      create/update/delete idempotenti fuori dalla transazione;
- [ ] classificare retry/permanent failure e mostrare `pending/exported/failed`;
- [ ] gestire delete, token revocato, 429, partial batch e send ambiguo;
- [ ] testare tutto con adapter fake, senza credenziali reali;
- [ ] chiudere H1 dimostrando che outage Google non blocca o corrompe il core.

### H2 — Riconciliazione e import

- [ ] implementare cursor/channel lifecycle, rinnovo e recovery senza fidarsi di
      payload o ID esterni non scoped;
- [ ] rilevare create/update/delete Google e registrare divergenze/tombstone;
- [ ] mappare timezone, all-day e ricorrenze senza perdita semantica;
- [ ] trasformare un cambiamento esterno in staging/proposta validata, non in
      sovrascrittura automatica ambigua;
- [ ] aggiungere riconciliazione full bounded per cursor perso o mapping divergente;
- [ ] testare reorder, duplicate, cursor expiry, delete concorrente e cross-tenant.

### H3 — Sincronizzazione bidirezionale

- [ ] definire policy conflitto per versione/campo e casi auto-merge vs preview;
- [ ] applicare le modifiche importate attraverso authorization, idempotenza,
      domain service, audit e Undo applicabile;
- [ ] impedire loop echo con origin/version/effect key stabili;
- [ ] mostrare conflitti risolvibili senza esporre dettagli nei log;
- [ ] testare race locale/Google, replay, ricorrenze, all-day, loop prevention,
      revoca durante sync e recovery dopo partial failure;
- [ ] validare ogni migration H fresh/upgrade/N-1 e il runbook di riconciliazione.

## Phase I — Mini App, diritti e core beta

### I1 — Mini App minima

- [ ] definire superficie minima: impostazioni, AI, privacy e calendario, senza
      duplicare inutilmente il bot;
- [ ] verificare `initData` Telegram lato server e usare sessioni firmate, brevi e ruotate;
- [ ] applicare CSRF/replay protection, CSP, secure headers e rate limiting;
- [ ] ricostruire sempre user/space scope lato server, mai fidarsi di ID client;
- [ ] implementare impostazioni e connessioni senza esporre credenziali;
- [ ] testare sessione scaduta/riusata, IDOR, XSS, clickjacking, cross-tenant,
      responsive e accessibilità.

### I2 — Export e cancellazione

- [ ] implementare export JSON e CSV per domini pertinenti con provenance/scope;
- [ ] implementare delete account con re-auth/conferma, revoca integrazioni,
      purge dati e ricevuta sul trattamento residuo;
- [ ] introdurre tombstone anti-resurrection per job Queue/Cron/provider pendenti;
- [ ] testare delete concorrente, retry idempotente e policy su dati
      condivisi/audit/backup;
- [ ] documentare retention/export/delete nel linguaggio mostrato all'utente;
- [ ] validare migration I e recovery dello stato cancellazione/export.

### I3.1 — Sicurezza, privacy e compliance

- [ ] aggiornare threat model e data-flow map end-to-end;
- [ ] eseguire review avversariale cross-tenant su HTTP, Queue, Cron, Mini App e OAuth;
- [ ] eseguire secret/log/fixture scan e dependency vulnerability review;
- [ ] validare rate limit per utente, chat, IP/endpoint e provider;
- [ ] verificare key rotation, credential deletion, OAuth revoke e callback replay;
- [ ] approvare retention table, processor map e testi trasparenza AI;
- [ ] approvare matrice residenza/subprocessori e DPIA per dati altamente
      personali/sensibili e uso AI prima del pilot;
- [ ] eseguire purge con fake clock su record scaduti/non scaduti di tenant diversi,
      ripetizione idempotente, fault/recovery e legal hold;
- [ ] completare revisione legale prima di qualunque commercializzazione.

### I3.2 — Affidabilità e prestazioni

- [ ] definire SLO e budget di latenza/errori da misure staging, non da ipotesi;
- [ ] eseguire load test su webhook, Queue, D1 hot query e reminder burst;
- [ ] usare `EXPLAIN QUERY PLAN` per tutte le query hot e fissare gli indici necessari;
- [ ] provare retry storm, poison message, provider outage e Telegram rate limit;
- [ ] provare backup/export e restore D1 in ambiente isolato;
- [ ] documentare rollback applicazione e migration recovery;
- [ ] configurare alert su error rate, queue lag, reminder stuck, auth failure e budget anomaly;
- [ ] misurare e applicare i trigger pre-pilot per dimensione D1, p95 query,
      `overloaded`, write throughput, Queue lag e DLQ;
- [ ] verificare graceful degradation `NO_AI` e integrazioni disconnesse.

### I3.3 — Release candidate e pilot

- [ ] creare staging isolato con bot, D1, Queue e segreti distinti;
- [ ] verificare retention/monitor/alert DLQ e replay bounded con envelope e
      idempotency key invariati prima di accettare dati pilot;
- [ ] eseguire smoke test end-to-end senza dati o token personali;
- [ ] eseguire il percorso completo onboarding -> core -> Inbox/AI -> media ->
      planner -> sharing -> briefing -> Google -> Mini App -> export/delete;
- [ ] eseguire pilot bounded con utenti consenzienti e canale feedback definito;
- [ ] triagiare ogni feedback come blocker beta, backlog futuro o non-obiettivo;
- [ ] correggere blocker con regression test e ripetere i gate pertinenti;
- [ ] produrre go/no-go report con evidenze, rischi residui e accettazioni esplicite;
- [ ] autorizzare separatamente deploy production e piano di rollback.

## Phase J — Documenti, amministrazione e persone

- [ ] J1 introduce registro documenti, categorie/scadenze/reminder e ricerca
      metadata per una sola categoria iniziale, poi estende senza enum rigidi;
- [ ] J2 separa raw Inbox transitorio, estratto con provenance e originale
      archiviato/cifrato solo per use case esplicito;
- [ ] collegare documenti a entità esistenti con riferimenti tipizzati e scope su
      entrambe le risorse, senza tabella polimorfa universale anticipata;
- [ ] J3 introduce persone interne, compleanni/anniversari, ultime interazioni e note;
- [ ] J4 aggiunge cose da chiedere, promesse, follow-up, regali e oggetti/denaro
      prestati, senza pagamenti o comportamento CRM;
- [ ] testare extraction provenance/correction, ricerca e delete, reminder dedupe,
      encryption/retention, cross-tenant e link orfani/revocati.

## Phase K — Finanze avanzate

- [ ] K1 aggiunge regole personali, ricorrenze, stipendio, affitto, utenze,
      abbonamenti e rate con categorie sempre modificabili;
- [ ] rilevare aumenti di abbonamento soltanto dalla cronologia registrata e
      mostrare confronto/provenance;
- [ ] K2 aggiunge budget totale/per categoria, risparmio e fondi futuri in minor unit;
- [ ] K3 costruisce scadenziario e forecast deterministico con formula/versione,
      dati mancanti visibili e disclaimer “stima, non consulenza”;
- [ ] K4 aggiunge report giorno/settimana/mese/anno, confronto periodi e import CSV
      manuale con preview, dedupe e rollback;
- [ ] provare minor unit/split/recurrence con property test e isolamento economico;
- [ ] eseguire scan che confermi assenza di Open Banking in schema/dipendenze/config.

## Phase L — Casa, famiglia e pasti

- [ ] L1 aggiunge manutenzione, scadenze, animali, figli e liste vacanza sopra gli
      spazi F, mantenendo private-by-default e assegnazioni esplicite;
- [ ] L2 aggiunge inventario, quantità/unità, prodotti da ricomprare e alimenti in
      scadenza con concorrenza condivisa e Undo;
- [ ] L3 aggiunge preferenze, allergie/esclusioni, pasti, ricette da disponibilità
      e lista spesa derivata con preview bulk;
- [ ] trattare allergie/esclusioni come hard constraint e non inventare
      compatibilità alimentare;
- [ ] testare role denial, membership revocata, update concorrenti, reminder
      dedupe e derivazione lista senza duplicare item.

## Phase M — Viaggi

- [ ] M1 crea viaggio manuale con date, tappe/timezone, indirizzi, partecipanti,
      attività e scope privato/shared;
- [ ] M2 acquisisce prenotazioni inoltrate, check-in e documenti tramite D3/J,
      conservando provenance e reminder;
- [ ] M3 collega budget/spese, itinerario, valigia/spesa e task pre-partenza ai
      domini esistenti senza copiarne i record;
- [ ] testare cambio timezone per tappa, update concorrente shared, document
      authorization, minor unit e link cancellati;
- [ ] dimostrare il flusso completo senza mappe, meteo o API di prenotazione.

## Phase N — Routine e benessere personale

- [ ] N1 aggiunge routine mattina/sera, abitudini, allenamenti, acqua, sonno e
      pause con recurrence locale e completamenti idempotenti;
- [ ] N2 usa visite, controlli, farmaci e integratori soltanto come reminder
      configurati dall'utente, senza dose o terapia inferita;
- [ ] N3 registra energia percepita e propone adattamenti orari opt-in con
      provenance, spiegazione, preview e controllo utente;
- [ ] applicare data classification sensibile, quiet hours e minimizzazione nei briefing;
- [ ] testare DST/recurrence, notification dedupe, opt-out, wording non clinico,
      assenza di diagnosi/prescrizioni e isolamento cross-tenant.

## Phase O — Convergenza del prodotto esteso

- [ ] aggiungere ricerca e link cross-domain soltanto tramite porte autorizzate;
- [ ] attivare con graceful degradation i contributor J-N il cui dominio ha
      completato i propri gate, usando il contratto definito in G3;
- [ ] completare export/delete, retention/purge e recovery per J-N;
- [ ] eseguire benchmark multimodale, load/restore e review security/privacy estesa;
- [ ] pubblicare matrice requisito -> acceptance test -> evidenza aggiornata;
- [ ] eseguire pilot del prodotto esteso e chiudere con zero finding P0/P1.

## Checklist finale di chiusura repository

- [ ] tutte le fasi del gate dichiarato (core beta I3 o prodotto esteso O) hanno
      exit criteria verificati; nessuna capability approvata è degradata a idea generica;
- [ ] tutte le feature del gate hanno scenario felice, limite, failure e recovery documentati;
- [ ] zero finding P0/P1 aperti; P2/P3 residui hanno owner e decisione esplicita;
- [ ] format, lint, typecheck, unit, integration, security, property e benchmark smoke verdi;
- [ ] migration riproducibili, forward validate e con recovery provata;
- [ ] lifecycle/purge è implementato e testato per ogni categoria persistita, non
      soltanto approvato come tabella di retention;
- [ ] dipendenze/versioni/compatibility date sono fissate e documentate;
- [ ] README, architettura, ADR, runbook, privacy, backlog e comandi sono aggiornati;
- [ ] installazione, test e build funzionano da clone pulito;
- [ ] nessun secret, dato personale, raw media o artefatto locale è tracciato;
- [ ] export, revoca integrazioni e cancellazione account sono verificati end-to-end;
- [ ] backup/restore, incident response, rollback e ownership operativa sono consegnati;
- [ ] sole integrazioni esterne differite restano nel backlog futuro; i domini
      J-N conservano milestone concrete e non diventano TODO impliciti;
- [ ] scan di documenti, schema, config e dipendenze conferma assenza Open Banking;
- [ ] Google H1-H3 ha mapping, adapter fake, conflict/recovery evidence coerenti con ADR-0011;
- [ ] `CURRENT_MILESTONE.md` registra la chiusura e rimanda al prossimo ciclo prodotto;
- [ ] release notes e matrice requisiti -> test -> evidenze sono pubblicate nel repo;
- [ ] tag/release candidate è creato soltanto dal proprietario o con sua autorizzazione;
- [ ] il main agent consegna un handoff finale con file, comandi, rischi accettati e decisioni.

## Matrice minima di evidenze

| Gate          | Evidenza richiesta                                              |
| ------------- | --------------------------------------------------------------- |
| Funzione      | scenario/acceptance test e messaggio utente osservato           |
| Tenancy       | repository scope esplicito + test cross-user/space negativo     |
| Idempotenza   | chiave/vincolo + retry test nel punto di partial failure        |
| Authorization | policy centralizzata + denial test prima della mutation         |
| Audit/Undo    | before/after redatto + prova apply/revert quando reversibile    |
| Tempo/denaro  | tipi espliciti + edge/property test pertinenti                  |
| AI            | schema/validator/policy test + benchmark/costo/privacy evidence |
| Operatività   | log/metriche redatti + recovery/rollback riprodotto             |
| Release       | comando esatto, esito, commit/tag e rischio residuo             |

Nessun agente può chiudere una fase basandosi soltanto sul proprio handoff. La
firma finale appartiene al main agent, che confronta evidenze, milestone e DoD.
