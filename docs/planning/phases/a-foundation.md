# Phase A — Foundation

> Stato: **completata** (2026-08-08). Archivio storico: leggere solo per ricostruire decisioni A1. Indice: [phases/README](README.md).

## A1.0 — Baseline e decision gate

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

## A1.1 — Toolchain e struttura minima

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

## A1.2 — Schema iniziale, identità e deduplica

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

## A1.3 — Contratti della vertical slice

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

## A1.4 — Webhook Telegram rapido e sicuro

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

## A1.5 — Consumer, authorization e `/start`

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

## A1.6 — Logging, osservabilità e failure UX

- [x] usare log JSON con event code, correlation/job ID, stato e latency; per
      correlare un utente usare ID operativo opaco o HMAC keyed/ruotabile con
      retention, mai hash diretto del Telegram `user_id`;
- [x] centralizzare redaction e serializzazione errori;
- [x] provare con test automatico che secret/payload/contenuti non compaiano nei log;
- [x] distinguere metricamente duplicate, invalid, retry, permanent e success;
- [x] definire cosa può essere mostrato all'utente per ogni classe di errore;
- [x] documentare diagnosi locale senza credenziali prod;
- [x] mantenere lo stesso correlation ID da webhook a Queue, D1 e reply.

## A1.7 — Test e uscita A1

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

## B2 — Reminder infrastructure (Phase B, completata localmente)

Valore utente: un reminder esplicito attraversa creazione, claim e delivery
senza duplicare l'effetto logico anche con Cron, Queue e Telegram soggetti a retry.
ADR-0008 la inserisce nella Phase B come vertical slice completa, senza
infrastruttura isolata. Non introdurre parsing AI.

- [x] registrare il lavoro come B2 e correggere roadmap/backlog;
- [x] attivare la milestone e dettagliare creazione, query, claim e delivery end-to-end;
- [x] definire state machine reminder e transizioni legali;
- [x] introdurre schema/indici tenant-scoped e migration versionata;
- [x] implementare claim atomico `pending -> claimed` per reminder dovuti;
- [x] pubblicare `SEND_NOTIFICATION` soltanto per righe effettivamente claimed,
      ammettendo replay fisici con una sola esecuzione logica;
- [x] implementare delivery con `dedupe_key` univoca;
- [x] classificare failure Telegram temporanee/permanenti e retry bounded;
- [x] gestire crash prima/dopo enqueue e prima/dopo invio senza duplicare domain
      effects; l'invio esterno segue la policy esplicita del punto successivo;
- [x] documentare il crash window dell'invio esterno e la policy at-most/at-least-once
      osservabile, senza promettere atomicità fra Telegram e D1;
- [x] aggiungere metriche su due, claimed, sent, retry, dead/permanent;
- [x] aggiungere test concorrenza, duplicate delivery, recovery e cross-tenant;
- [x] documentare recovery di reminder stuck e rollback migration;
- [x] chiudere i gate prima di B3 e delle slice B dipendenti.

Agent route: main agent/state machine; `domain_worker` regole; `cloudflare_worker`
Cron/Queue/delivery; review sicurezza e qualità dopo integrazione.
