# Roadmap

Le fasi sono gate di prodotto ordinati per dipendenza. Una fase futura definisce
un impegno di prodotto, non autorizza scaffold: si implementa soltanto la
vertical slice dichiarata in `CURRENT_MILESTONE.md`.

La [matrice di copertura](REQUIREMENTS_COVERAGE.md) collega ogni requisito a una
milestone; il [master action plan](MASTER_ACTION_PLAN.md) esplicita verifiche e
failure mode.

## Regole di sequenza

- una sola milestone, e al suo interno un solo incremento verificabile, è attivo;
- ogni dominio funziona senza AI e senza integrazioni esterne;
- l'Inbox instrada verso i domini, non ne duplica dati o regole;
- le integrazioni arrivano dopo il relativo dominio locale;
- Google Calendar è l'unica integrazione esterna nella roadmap corrente;
- Open Banking è escluso definitivamente (ADR-0009).

## Phase A — Foundation

Stato: **completata e revalidata localmente il 2026-08-08**. Nessun deploy
remoto.

A1 ha consegnato Worker, D1 EU, migrations, webhook Telegram, Queue, logging,
identità interna, authorization, idempotenza, audit/delivery ledger e `/start`
deterministico con test. L'infrastruttura reminder è stata assorbita in B2.

## Phase B — Core deterministico

Stato: **B1-B4 completate localmente il 2026-08-08; B5 è la prossima milestone
prevista ma non è attivata**.

| Milestone                          | Outcome                                                                                             | Criteri di uscita essenziali                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **B1 Preferenze + agenda one-off** | lingua/timezone/formato ora/valuta/privacy; eventi privati date-only o instant; `/oggi` e `/domani` | DST e mezzanotte corretti; create/read/update/cancel autorizzati, idempotenti, auditati e annullabili; test cross-tenant |
| **B2 Reminder end-to-end**         | reminder espliciti, claim atomico, Queue e delivery                                                 | una sola esecuzione logica sotto retry; dedupe, recovery, errori temporanei/permanenti, test DST/cross-tenant            |
| **B3 Task**                        | task, priorità, scadenze, completamento/riapertura                                                  | date-only distinte dagli instant; mutation e Undo idempotenti; viste deterministiche                                     |
| **B4 Lavoro**                      | turni pianificati, consuntivi e pause separati                                                      | attraversamento mezzanotte/DST e report verificabili; regole data-driven                                                 |
| **B5 Finanze base**                | spese/entrate da comando, valuta, data, categoria, esercente/note/metodo facoltativi                | minor unit intere; correzione/delete/Undo; totali deterministici; isolamento economico cross-tenant                      |
| **B6 Liste e ricorrenze minime**   | liste/note private, item e ricorrenze necessarie                                                    | idempotenza; ora locale/timezone preservate; property test recurrence                                                    |
| **B7 Report base**                 | riepiloghi agenda/task/lavoro/finanze per periodo                                                   | provenance dei totali, timezone esplicita, CSV export base e zero dipendenza AI                                          |

## Phase C — Tessavio Inbox testuale + AI opzionale

| Milestone             | Outcome                                                                         | Criteri di uscita essenziali                                                                                  |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **C1 ActionProposal** | union strict/versionata per le azioni B, validator e policy                     | schema -> Zod -> scope/permission/policy -> domain; output invalido non scrive; benchmark smoke               |
| **C2 OAuth e router** | key OpenRouter user-controlled via OAuth PKCE, cifratura, capability/budget     | distinto dal provider-BYOK interno a OpenRouter; replay/ciphertext swap negati; `NO_AI` sempre operativo      |
| **C3 Inbox testuale** | testo, messaggi inoltrati e link producono proposte multi-intent verso i domini | nessun modello dati duplicato; domanda mirata se ambiguo; execute+Undo solo per low-risk; provenance e dedupe |

## Phase D — Voce, vision e allegati transitori

| Milestone                    | Outcome                                                                          | Criteri di uscita essenziali                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **D1 Voce**                  | download nel consumer, STT e trascrizione revisionabile                          | limiti tipo/durata; cleanup anche su errore; stesso pipeline C; fixture italiane sintetiche                   |
| **D2 Immagini e screenshot** | extraction strutturata da foto/screenshot                                        | preview per batch/incertezza; provenance; raw eliminato; budget/privacy applicati                             |
| **D3 Documenti in Inbox**    | PDF e documenti supportati, ricevute/scontrini/bollette e prenotazioni inoltrate | allowlist e limiti; difese parser; proposta verso finanze/documenti/viaggi; nessuna persistenza raw implicita |

## Phase E — Pianificazione intelligente deterministica

| Milestone               | Outcome                                                                    | Criteri di uscita essenziali                                                               |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **E1 Durate e passi**   | durata stimata o richiesta; task grandi divisi in passi revisionabili      | l'AI può proporre, il dominio valida; nessuno slot applicato senza dati sufficienti        |
| **E2 Allocazione**      | finestre libere, vincoli hard/soft, turni/sonno/preferenze, carico massimo | allocator deterministico; property test overlap/DST; piano impossibile o parziale spiegato |
| **E3 Riprogrammazione** | task incomplete riproposte/spostate con motivo                             | preview per modifiche significative; stale-version rejection; apply idempotente e Undo     |

## Phase F — Spazi condivisi

| Milestone                              | Outcome                                         | Criteri di uscita essenziali                                                          |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| **F1 Membership e lista condivisa**    | spazi, inviti, ruoli e prima lista condivisa    | `SpaceScope`, role denial e test leakage; privato non condiviso implicitamente        |
| **F2 Calendario e attività familiari** | eventi, task/faccende e reminder condivisi      | attore/scope visibili, preview bulk, audit e revoca membership                        |
| **F3 Spese condivise**                 | partecipanti, split, debiti e crediti personali | quote esatte in minor unit; autorizzazioni; settlement solo registrato, mai pagamento |

## Phase G — Briefing e assistenza proattiva

| Milestone                            | Outcome                                                                             | Criteri di uscita essenziali                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **G1 Brief giornaliero**             | briefing mattutino e riepilogo serale opzionale sui soli domini già completati      | contenuti/orario/frequenza configurabili; quiet hours; dedupe e anti-spam; testo conciso/non ansiogeno |
| **G2 Riepiloghi periodici**          | settimanale e mensile sui dati realmente disponibili al termine della Phase B       | nessuna dipendenza da spese programmate, forecast o K1-K3; provenance; una notifica logica sotto retry |
| **G3 Contratto contributor bounded** | porta interna tipizzata per contributi futuri con isolamento e graceful degradation | nessuna query cross-domain libera e nessuna attivazione o requisito anticipato dei domini J-N          |

## Phase H — Google Calendar

Google Calendar è parte del prodotto corrente. L'affidabilità cresce per livelli;
D1 resta autorevole e non si usa last-write-wins cieco (ADR-0011).

| Milestone                                | Outcome                                                                                     | Criteri di uscita essenziali                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **H1 Collegamento + export controllato** | OAuth least-privilege, calendario scelto, mapping stabile, create/update/delete idempotenti | outbox, retry, stato pending/exported/failed, revoca/disconnessione, adapter fake; outage Google non blocca il core            |
| **H2 Riconciliazione + import**          | rilevazione modifiche Google e import in staging di sync                                    | cursor/channel lifecycle, all-day/timezone/ricorrenze, tombstone, report divergenze; nessuna sovrascrittura automatica ambigua |
| **H3 Sync bidirezionale**                | applicazione controllata delle modifiche e conflitti risolvibili                            | policy per campo/versione, preview conflitti, loop prevention, replay/race test e audit; recovery riproducibile                |

## Phase I — Mini App, diritti e core beta

| Milestone                     | Outcome                                                             | Criteri di uscita essenziali                                                                   |
| ----------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **I1 Mini App minima**        | impostazioni, connessioni, calendario e privacy                     | `initData` verificato, sessioni brevi, CSRF/replay/IDOR testati, accessibilità mobile          |
| **I2 Export e cancellazione** | export JSON/CSV, revoca integrazioni e delete account               | purge/recovery, tombstone anti-resurrection, trattamento dati condivisi/audit/backup esplicito |
| **I3 Core beta hardening**    | review security/privacy, load/restore test, staging e pilot bounded | zero P0/P1, runbook e SLO, suite completa verde, go/no-go esplicito                            |

## Phase J — Documenti, amministrazione e persone

| Milestone                   | Outcome                                                                                                                          | Criteri di uscita essenziali                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **J1 Registro documenti**   | metadata e scadenze per bollette, ricevute, garanzie, assicurazioni, veicoli, contratti, prenotazioni, identità/certificati/casa | categorie estendibili, reminder e ricerca metadata; cifratura/retention/export/delete; test cross-tenant     |
| **J2 Archivio e ricerca**   | estratti ricercabili e documento cifrato solo su scelta/necessità                                                                | provenance per campo; accesso autorizzato; lifecycle raw/derived; collegamenti tipizzati a oggetti esistenti |
| **J3 Persone e ricorrenze** | persone interne, compleanni/anniversari, note, ultime interazioni                                                                | niente dipendenza Contacts; private-by-default; ricerca e mutation con audit/Undo                            |
| **J4 Follow-up e prestiti** | cose da chiedere, promesse, richiami, regali, oggetti/denaro prestati                                                            | reminder deduplicati; link a eventi/task/spese; nessun comportamento CRM o pagamento                         |

## Phase K — Finanze avanzate

| Milestone                      | Outcome                                                                             | Criteri di uscita essenziali                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **K1 Ricorrenze e regole**     | regole personali di categoria, stipendio, affitto, utenze, abbonamenti e rate       | regole modificabili e spiegabili; recurrence corretta; variazioni abbonamenti basate solo sulla cronologia registrata  |
| **K2 Budget e obiettivi**      | budget totale/per categoria, risparmio e fondi futuri                               | soglie in minor unit; periodi/timezone espliciti; alert configurabili e non ansiogeni                                  |
| **K3 Forecast e scadenziario** | entrate/uscite programmate e previsione saldo                                       | formula/provenance/versione; scenario deterministico; etichetta “stima, non consulenza” e dati insufficienti espliciti |
| **K4 Analisi e portabilità**   | riepiloghi giorno/settimana/mese/anno, confronto periodi, CSV export/import manuale | import preview+dedupe+rollback; report tenant-safe; nessun Open Banking                                                |

## Phase L — Casa, famiglia e pasti

| Milestone                   | Outcome                                                                                      | Criteri di uscita essenziali                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **L1 Casa e famiglia**      | manutenzione, scadenze, animali, figli e liste vacanza                                       | entità private o `SpaceScope` esplicito; assegnazioni/notification dedupe                |
| **L2 Inventario domestico** | prodotti presenti, da ricomprare e alimenti in scadenza                                      | quantità/unità validate, correzione/Undo e concorrenza condivisa testata                 |
| **L3 Pasti e ricette**      | preferenze/allergie/esclusioni, piano pasti, ricette da disponibilità e lista spesa derivata | allergie sempre vincolo hard; fonte/assunzioni visibili; preview prima di mutazioni bulk |

## Phase M — Viaggi

| Milestone                       | Outcome                                                         | Criteri di uscita essenziali                                                  |
| ------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **M1 Viaggio manuale**          | date, tappe, indirizzi, partecipanti, attività e note           | timezone per tappa; privato/shared esplicito; nessuna API esterna richiesta   |
| **M2 Prenotazioni e documenti** | prenotazioni inoltrate, check-in e documenti collegati          | extraction con provenance; reminder; accesso e retention coerenti con J       |
| **M3 Budget e preparazione**    | budget/spese viaggio, itinerario, valigia, spesa e pre-partenza | minor unit; link senza duplicare finanze/liste/task; riepilogo deterministico |

## Phase N — Routine e benessere personale

| Milestone                   | Outcome                                                     | Criteri di uscita essenziali                                                               |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **N1 Routine e abitudini**  | mattina/sera, abitudini, allenamenti, acqua, sonno e pause  | recurrence/timezone corrette; completamenti idempotenti; controllo utente                  |
| **N2 Visite e promemoria**  | visite, controlli, farmaci/integratori come reminder        | disclaimer e linguaggio non clinico; nessuna dose/terapia inventata; privacy e quiet hours |
| **N3 Adattamento prudente** | energia percepita e proposta orari da completamenti passati | spiegazione/provenance; opt-in; preview; nessuna diagnosi o trattamento                    |

## Phase O — Convergenza e hardening del prodotto completo

Ricerca e collegamenti cross-domain autorizzati, attivazione nei briefing dei
contributor J-N soltanto dopo il completamento dei rispettivi domini,
export/cancellazione completi, benchmark multimodale, restore/load/security review
e pilot del prodotto esteso. Uscita: requisiti -> test -> evidenza tracciati nella
matrice, zero P0/P1 e recovery verificata per ogni categoria persistita.

## Integrazioni esterne differite

Solo dopo che il dominio corrispondente è utile localmente: Gmail, Google Drive,
Google Contacts, Google Tasks, meteo, mappe/navigazione, prenotazioni, spedizioni,
supermercati/cataloghi, dispositivi e posizione via Mini App. Non sono
prerequisiti delle fasi J-N e non autorizzano tabelle o adapter anticipati.
