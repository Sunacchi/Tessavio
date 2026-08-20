# Phase I — Mini App, diritti e core beta

> Stato: **non attiva**. È il **gate di chiusura della core beta**: le altre
> fasi costruiscono, questa dimostra. Piano di fase, non autorizzazione: si
> implementa solo ciò che [CURRENT_MILESTONE](../CURRENT_MILESTONE.md) attiva.

## Sintesi

| Slice    | Outcome                                                    |
| -------- | ---------------------------------------------------------- |
| **G-I**  | le decisioni che I non può prendere da sé, firmate         |
| **I1**   | Mini App minima: impostazioni, AI, privacy, calendario     |
| **I2**   | export e cancellazione dell'account, con anti-resurrection |
| **I3.1** | sicurezza, privacy e compliance                            |
| **I3.2** | affidabilità e prestazioni misurate, non ipotizzate        |
| **I3.3** | release candidate, pilot e go/no-go                        |

Tre cose che rendono I diversa da tutte le altre fasi:

1. **Qui il vincolo "nessuna risorsa remota" deve cadere.** Fino a I3.3 il
   repository non ha mai creato un D1, una Queue o un bot reali: I3.3 richiede
   uno staging isolato con bot, database, code e segreti propri. È la decisione
   più grande dell'intera roadmap e non è delegabile — `.claude/settings.json`
   nega deliberatamente `wrangler deploy`, `wrangler secret` e `--remote`.
2. **Il prodotto di I non è codice, è evidenza.** Un gate "verde perché nessuno
   ha trovato niente" non è chiuso. Ogni criterio di uscita deve puntare a una
   misura, un test o un report firmato.
3. **I2 dipende da una decisione di F.** Cosa succede ai dati condivisi quando
   un membro cancella l'account è una scelta di prodotto che va presa in
   [G-F](f-sharing.md#g-f--gate-dingresso-decisioni-del-proprietario), non
   improvvisata mentre si implementa la cancellazione.

---

## G-I — Gate d'ingresso: decisioni del proprietario

Corrisponde alla voce **Go/no-go** già aperta nel
[decision register](../MASTER_ACTION_PLAN.md).

- [ ] **Autorizzazione allo staging remoto** e al budget che comporta.
- [ ] **SLO**: latenza e tasso di errore accettabili, da misure su staging.
- [ ] **RPO e RTO**: quanto dato si può perdere e in quanto tempo si rientra.
- [ ] **Autorità di firma** del go/no-go e regola sui finding residui: quali
      severità bloccano il pilot e quali si accettano per iscritto.
- [ ] **Perimetro della Mini App**: cosa esiste solo lì e cosa resta anche nel
      bot. Raccomandazione: **nulla di essenziale solo nella Mini App**, così un
      problema del frontend non toglie funzionalità.
- [ ] **DPIA e revisione legale**: chi le esegue e quando, sapendo che devono
      chiudersi **prima** del pilot con dati reali.

---

## Sequenza

### I1 — Mini App minima

- superficie ridotta: impostazioni, stato AI, privacy e calendario. Non duplica
  il bot per il gusto di avere una UI;
- `initData` di Telegram verificato **lato server**, mai lato client; sessioni
  firmate, brevi e ruotate;
- protezione CSRF e anti-replay, CSP, header di sicurezza, rate limiting;
- user e space scope **ricostruiti lato server a ogni richiesta**: un ID che
  arriva dal client è un input, non un'identità;
- nessuna credenziale esposta al frontend, in nessuna forma, nemmeno parziale;
- test: sessione scaduta e riusata, IDOR, XSS, clickjacking, cross-tenant,
  responsive e accessibilità.

### I2 — Export e cancellazione

- export JSON e CSV per i domini pertinenti, con provenance e scope;
- cancellazione dell'account con re-autenticazione, revoca delle integrazioni,
  purge e ricevuta di ciò che resta e perché;
- **tombstone anti-resurrection**: un job Queue o Cron in volo, o un callback di
  un provider che arriva dopo la cancellazione, non deve ricreare l'utente. È il
  difetto classico di ogni delete distribuito;
- test: cancellazione concorrente, retry idempotente, policy su dati condivisi,
  audit e backup;
- retention, export e delete documentati **nel linguaggio mostrato all'utente**,
  non solo nello schema.

### I3.1 — Sicurezza, privacy e compliance

- threat model e mappa dei flussi di dati aggiornati end-to-end;
- review avversariale cross-tenant su HTTP, Queue, Cron, Mini App e OAuth;
- scan di segreti, log e fixture; review delle vulnerabilità delle dipendenze;
- rate limit verificati per utente, chat, IP/endpoint e provider;
- rotazione delle chiavi, cancellazione delle credenziali, revoca OAuth e
  replay dei callback verificati;
- tabella di retention, mappa dei processor e testi di trasparenza AI approvati;
- matrice di residenza e subprocessori e **DPIA chiusa prima del pilot** con
  dati reali;
- purge eseguita con fake clock su record scaduti e non scaduti di tenant
  diversi, ripetibile, con fault, recovery e legal hold;
- revisione legale completata prima di qualunque commercializzazione.

### I3.2 — Affidabilità e prestazioni

- SLO e budget derivati da **misure su staging**, non da ipotesi;
- load test su webhook, Queue, query hot di D1 e burst di reminder;
- `EXPLAIN QUERY PLAN` su tutte le query hot, con gli indici che ne conseguono;
- prove di retry storm, poison message, outage del provider e rate limit Telegram;
- backup, export e restore di D1 provati in ambiente isolato;
- rollback applicativo e recovery delle migration documentati;
- alert su tasso di errore, lag della coda, reminder bloccati, fallimenti di
  autenticazione e anomalie di budget;
- trigger pre-pilot misurati: dimensione D1, p95 delle query, `overloaded`,
  throughput di scrittura, lag della coda e DLQ;
- degradazione verificata in `NO_AI` e con integrazioni disconnesse.

### I3.3 — Release candidate e pilot

- staging isolato con bot, D1, Queue e segreti distinti da qualsiasi altro
  ambiente;
- DLQ con retention, monitor, alert e replay bounded a envelope e idempotency
  key invariati, verificati **prima** di accettare dati del pilot;
- smoke test end-to-end senza dati né token personali;
- percorso completo: onboarding → core → Inbox/AI → media → planner → sharing →
  briefing → Google → Mini App → export/delete;
- pilot bounded con utenti consenzienti e canale di feedback definito;
- ogni feedback triagiato come blocker beta, backlog futuro o non-obiettivo;
- blocker corretti partendo da un regression test che fallisce;
- report go/no-go con evidenze, rischi residui e accettazioni esplicite;
- **deploy in produzione e piano di rollback autorizzati separatamente**: la
  chiusura del gate non è un'autorizzazione a pubblicare.

---

## Rischi e mitigazioni

| Rischio                                                  | Mitigazione                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Primo contatto con risorse remote proprio al gate finale | staging autorizzato in G-I, non a I3.3 iniziata               |
| Utente ricreato da un job in volo dopo la cancellazione  | tombstone anti-resurrection, testato con job pendenti         |
| ID del client usato come identità nella Mini App         | scope ricostruito server-side a ogni richiesta                |
| SLO scelti a tavolino e non misurati                     | derivati da load test su staging                              |
| DPIA rimandata a dopo il pilot                           | criterio bloccante esplicito prima dei dati reali             |
| Funzione essenziale disponibile solo nella Mini App      | decisione di perimetro in G-I                                 |
| Gate dichiarato verde senza evidenza                     | ogni criterio punta a una misura, un test o un report firmato |
| Dati condivisi orfani alla cancellazione                 | decisione presa in G-F, applicata qui                         |

---

## Criteri di uscita della Phase I

- [ ] la Mini App non introduce alcuna via per aggirare authorization o scope;
- [ ] export e cancellazione sono completi, idempotenti e a prova di resurrection;
- [ ] threat model, review avversariale, scan e DPIA chiusi con esito registrato;
- [ ] SLO misurati su staging, non stimati, e alert attivi;
- [ ] backup e restore provati; rollback e migration recovery documentati;
- [ ] pilot eseguito con feedback triagiato e blocker chiusi con regression test;
- [ ] report go/no-go firmato con rischi residui accettati per iscritto;
- [ ] deploy in produzione autorizzato come decisione separata;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.

## Agent route

Il main agent conduce l'intera fase: trust boundary, accettazione del rischio e
firma del go/no-go non sono delegabili, e la firma non spetta a chi ha
implementato. `cloudflare_worker` e un writer frontend costruiscono la Mini App
su contratti già congelati; entrambi i reviewer lavorano in contesto fresco e
read-only; strumenti di load test e di analisi di sicurezza si usano su staging,
mai su dati reali. Chiusura secondo
[RELEASE_CLOSURE.md](../RELEASE_CLOSURE.md).
