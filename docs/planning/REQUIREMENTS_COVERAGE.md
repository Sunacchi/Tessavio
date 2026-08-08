# Matrice di copertura requisiti

Audit del repository al 2026-08-08, prima di questo aggiornamento documentale.
La colonna **stato iniziale** fotografa codice, schema, test e piani trovati; la
colonna **collocazione** registra l'esito dell'aggiornamento. Non equivale a
implementazione completata.

## Legenda

- **Presente**: implementato e coperto da evidenze/test pertinenti.
- **Parziale**: esiste solo una parte del comportamento o della foundation.
- **Pianificata**: non implementata, ma già collocata concretamente prima dell'audit.
- **Mancante**: né implementata né collocata concretamente prima dell'audit.

Evidenza di baseline: A1 implementava solo `/start`, normalizzazione testo minima,
inbox durevole, dedupe, Queue, identità interna, authorization self-scope,
audit/effect/delivery ledger e test foundation. Dopo l'audit, B1.1 ha aggiunto
preferenze temporali private e B1.2 eventi one-off privati `date_only|instant`,
comandi deterministici, audit, Undo e viste `/oggi`/`/domani`. B2 ha aggiunto
reminder one-off, quiet hours, Cron/Queue e delivery deduplicata. Task, finanze,
documenti, persone e spazi restano nello stato indicato nelle tabelle.

## 1. Tessavio Inbox

| Funzione                                    | Stato iniziale | Evidenza / gap                                                              | Collocazione                             |
| ------------------------------------------- | -------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| Messaggi normali                            | Parziale       | A1 normalizza testo e accoda; gestisce solo `/start`                        | C3 dopo i comandi B                      |
| Messaggi Telegram inoltrati                 | Mancante       | provenance forward non normalizzata                                         | C3                                       |
| Vocali                                      | Pianificata    | Phase D prevedeva STT transitorio                                           | D1                                       |
| Fotografie e screenshot                     | Pianificata    | vision transitoria prevista, non implementata                               | D2                                       |
| PDF e altri documenti supportati            | Mancante       | schema Telegram e lifecycle documenti assenti                               | D3                                       |
| Ricevute, scontrini e bollette              | Parziale       | vision generica prevista; routing economico/documentale assente             | D3, J1 e K1                              |
| Link                                        | Mancante       | nessun normalizer o policy fetch                                            | C3; fetch remoto resta adapter esplicito |
| Riconoscere appuntamenti, reminder e task   | Parziale       | domini B pianificati separatamente, Inbox AI non implementata               | B1-B3, poi C3                            |
| Riconoscere spese, entrate e bollette       | Parziale       | spese base B5 pianificate; entrate/bollette non dettagliate                 | B5, C3, D3, K1                           |
| Riconoscere documenti e scadenze            | Mancante       | dominio documenti assente                                                   | D3 e J1-J2                               |
| Riconoscere elementi lista e note           | Parziale       | liste B6 pianificate, note non esplicite                                    | B6 e C3                                  |
| Riconoscere informazioni relative a persone | Mancante       | dominio persone assente                                                     | J3-J4                                    |
| Archiviare o riproporre contenuti           | Mancante       | nessun dominio/attention lifecycle                                          | J2, poi contributor attivato in O        |
| Punto comune senza duplicare i domini       | Parziale       | Smart Inbox è un confine architetturale, non ancora un dispatcher tipizzato | ADR-0010, C3                             |
| AI interpreta e propone soltanto            | Pianificata    | ADR-0002 e invarianti presenti; nessun layer AI in codice                   | C1-C3                                    |
| Domanda breve per ambiguità                 | Pianificata    | confirmation policy descritta, non implementata                             | C1 e C3                                  |
| Esecuzione low-risk con conferma e Undo     | Pianificata    | policy descritta; foundation non implementa Undo di dominio                 | B1 e C1-C3                               |

## 2. Spese ed entrate

| Funzione                                          | Stato iniziale | Evidenza / gap                                    | Collocazione                   |
| ------------------------------------------------- | -------------- | ------------------------------------------------- | ------------------------------ |
| Inserimento spese via testo/comando               | Pianificata    | B5 senza schema/codice                            | B5                             |
| Inserimento entrate via testo/comando             | Mancante       | B5 parlava solo di spese                          | B5                             |
| Inserimento via vocale                            | Parziale       | STT generico previsto                             | D1 + B5                        |
| Foto di scontrini, ricevute e bollette            | Parziale       | vision generica prevista                          | D2-D3 + B5/J1                  |
| Importo, valuta e data                            | Pianificata    | minor unit e tempo sono invarianti                | B5                             |
| Categoria modificabile                            | Pianificata    | categoria base prevista                           | B5                             |
| Esercente, note e metodo di pagamento facoltativo | Mancante       | campi non specificati                             | B5                             |
| Categorie automatiche modificabili                | Mancante       | nessuna regola/proposta dedicata                  | C3 e K1                        |
| Regole personali di categorizzazione              | Mancante       | assenti                                           | K1                             |
| Entrate/spese ricorrenti                          | Parziale       | recurrence generica prevista                      | K1                             |
| Stipendio e affitto                               | Mancante       | assenti come casi di dominio                      | K1                             |
| Bollette, abbonamenti e rate                      | Mancante       | assenti come casi di dominio                      | K1                             |
| Budget mensile complessivo                        | Mancante       | “budget” esistente era budget AI, non finanziario | K2                             |
| Budget per categoria                              | Mancante       | assente                                           | K2                             |
| Obiettivi di risparmio e fondi futuri             | Mancante       | assenti                                           | K2                             |
| Previsione entrate/uscite programmate             | Mancante       | assente                                           | K3                             |
| Previsione saldo                                  | Mancante       | assente                                           | K3                             |
| Abbonamenti e aumenti                             | Mancante       | assente                                           | K1/K3, solo da dati registrati |
| Scadenziario economico                            | Mancante       | assente                                           | K3 e G2                        |
| Spese condivise                                   | Parziale       | sharing/spese separati previsti                   | F3                             |
| Divisione spesa tra persone                       | Mancante       | assente                                           | F3                             |
| Debiti e crediti personali                        | Mancante       | assenti                                           | F3/J4                          |
| Prestiti di denaro                                | Mancante       | assenti                                           | J4, senza pagamenti            |
| Riepiloghi giorno/settimana/mese/anno             | Parziale       | report base generici previsti                     | B7 e K4                        |
| Confronto tra periodi                             | Mancante       | assente                                           | K4                             |
| Export CSV                                        | Parziale       | Mini App/export generico previsto                 | B7, K4 e I2                    |
| Import manuale CSV                                | Mancante       | assente                                           | K4                             |
| Modifica, eliminazione e Undo                     | Pianificata    | invariante globale, non implementata per finanze  | B5                             |
| Isolamento dati economici                         | Pianificata    | `UserScope` e test negativi obbligatori           | B5/F3/K*                       |
| Forecast come stima, non consulenza               | Mancante       | disclaimer non presente                           | K3 e DoD                       |

## 3. Esclusione Open Banking

| Funzione / esclusione                                | Stato iniziale | Evidenza / gap                                       | Collocazione            |
| ---------------------------------------------------- | -------------- | ---------------------------------------------------- | ----------------------- |
| Nessun collegamento o sync di conti correnti         | Parziale       | nessun codice/schema, ma nessuna decisione esplicita | ADR-0009                |
| Nessuna credenziale bancaria                         | Parziale       | non presente tecnicamente; policy esplicita mancante | ADR-0009 e SECURITY     |
| Nessun provider PSD2, AISP o PISP                    | Parziale       | nessuna dipendenza; esclusione non registrata        | ADR-0009                |
| Nessuna disposizione automatica di pagamenti         | Parziale       | nessuna funzione; non-obiettivo non esplicito        | ADR-0009 e PROJECT      |
| Nessun adapter, dipendenza o tabella bancaria futura | Mancante       | guardrail architetturale assente                     | ADR-0009 e ARCHITECTURE |
| CSV manuale distinto da Open Banking                 | Mancante       | import CSV non pianificato                           | K4 e ADR-0009           |

## 4. Briefing e assistenza proattiva

| Funzione                                            | Stato iniziale | Evidenza / gap                                                | Collocazione                      |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------- | --------------------------------- |
| Briefing mattutino                                  | Mancante       | assente                                                       | G1                                |
| Riepilogo serale facoltativo                        | Mancante       | assente                                                       | G1                                |
| Riepilogo settimanale e mensile                     | Mancante       | report generici non includevano delivery proattiva            | G2                                |
| Eventi, task, scadenze, turni e reminder            | Parziale       | domini pianificati, composizione proattiva assente            | G1-G2 dopo B                      |
| Situazione economica e spese programmate            | Mancante       | finanza avanzata assente                                      | K3, poi contributor attivato in O |
| Documenti in scadenza e persone da ricontattare     | Mancante       | domini assenti                                                | J, poi contributor attivato in O  |
| Elementi incompleti                                 | Parziale       | task previsti, attention policy assente                       | G1-G3                             |
| Contenuti/orari/frequenza/quiet hours configurabili | Parziale       | quiet hours B2 presenti; contenuti/frequenza briefing assenti | G1                                |
| Notifiche concise, non ansiogene e non ripetitive   | Parziale       | reminder B2 concisi e deduplicati; briefing assente           | G1 + DoD                          |

## 5. Documenti e amministrazione personale

| Funzione                                               | Stato iniziale | Evidenza / gap                                | Collocazione            |
| ------------------------------------------------------ | -------------- | --------------------------------------------- | ----------------------- |
| Bollette, ricevute e scontrini                         | Mancante       | nessun registro documenti                     | D3/J1                   |
| Garanzie e assicurazioni                               | Mancante       | assenti                                       | J1                      |
| Revisione e documenti veicolo                          | Mancante       | assenti                                       | J1                      |
| Contratti e prenotazioni                               | Mancante       | assenti                                       | J1/M2                   |
| Carta d'identità, passaporto e certificati             | Mancante       | assenti                                       | J1                      |
| Documenti personali e casa                             | Mancante       | assenti                                       | J1                      |
| Classificazione ed estrazione rilevante                | Parziale       | vision generica prevista                      | D3/J2                   |
| Importi, scadenze e reminder                           | Mancante       | collegamento cross-domain assente             | J1-J2                   |
| Ricerca                                                | Mancante       | assente                                       | J1-J2                   |
| Link a spesa, evento, persona, veicolo o altro oggetto | Mancante       | assente; evitare FK polimorfe speculative     | ADR-0010/J2             |
| Cifratura, authorization e retention                   | Parziale       | invarianti generali, policy documenti assente | J1-J2, SECURITY/PRIVACY |
| Export e cancellazione                                 | Parziale       | diritti generici previsti                     | I2/J1                   |
| Evitare raw media non necessari                        | Pianificata    | immagini/audio transitori; PDF non definito   | D3/J2 e DATA_POLICY     |

## 6. Casa, famiglia e spazi condivisi

| Funzione                                 | Stato iniziale | Evidenza / gap                         | Collocazione |
| ---------------------------------------- | -------------- | -------------------------------------- | ------------ |
| Calendario familiare                     | Parziale       | evento condiviso generico previsto     | F2           |
| Liste spesa condivise                    | Parziale       | prima lista condivisa prevista         | F1           |
| Spese condivise                          | Parziale       | sharing e spese previsti separatamente | F3           |
| Attività domestiche e faccende assegnate | Mancante       | assenti                                | F2/L1        |
| Manutenzione e scadenze casa             | Mancante       | “home assets” era futuro generico      | L1           |
| Promemoria animali e appuntamenti figli  | Mancante       | assenti                                | L1           |
| Liste viaggi e vacanze                   | Mancante       | assenti                                | L1/M3        |
| Pianificazione pasti                     | Mancante       | assente                                | L3           |
| Prodotti presenti/da ricomprare          | Mancante       | assenti                                | L2           |
| Alimenti in scadenza                     | Mancante       | assenti                                | L2           |
| Preferenze, allergie e alimenti esclusi  | Mancante       | assenti                                | L3           |
| Ricette da disponibilità                 | Mancante       | assenti                                | L3           |
| Lista spesa dai pasti                    | Mancante       | assente                                | L3           |
| Privacy default e sharing esplicito      | Pianificata    | invarianti e Phase F presenti          | F1-F3/L*     |

## 7. Persone, ricorrenze e follow-up

| Funzione                                     | Stato iniziale | Evidenza / gap                               | Collocazione                      |
| -------------------------------------------- | -------------- | -------------------------------------------- | --------------------------------- |
| Persone interne senza Google Contacts        | Mancante       | nessun dominio persona                       | J3                                |
| Compleanni e anniversari                     | Mancante       | assenti                                      | J3                                |
| Ultime interazioni                           | Mancante       | assente                                      | J3                                |
| Cose da chiedere e promesse                  | Mancante       | assenti                                      | J4                                |
| Persone da richiamare e follow-up            | Mancante       | assenti                                      | J4, poi contributor attivato in O |
| Regali fatti o da valutare                   | Mancante       | assenti                                      | J4                                |
| Oggetti prestati                             | Mancante       | assenti                                      | J4                                |
| Denaro prestato                              | Mancante       | assente                                      | J4/F3                             |
| Note personali                               | Mancante       | liste/note generiche non modellavano persone | J3                                |
| Link persone-eventi-task-spese               | Mancante       | assenti                                      | ADR-0010/J4                       |
| Non diventare CRM aziendale                  | Mancante       | limite non dichiarato                        | PROJECT/J3                        |
| Google Contacts solo integrazione successiva | Mancante       | non distinto dal dominio                     | Roadmap integrazioni differite    |

## 8. Pianificazione intelligente

| Funzione                                      | Stato iniziale | Evidenza / gap                                 | Collocazione         |
| --------------------------------------------- | -------------- | ---------------------------------------------- | -------------------- |
| Stimare o chiedere durata                     | Parziale       | input durata previsto, UX non dettagliata      | E1                   |
| Dividere task grandi                          | Mancante       | assente                                        | E1                   |
| Distinguere flessibili e appuntamenti fissi   | Parziale       | planner con blocchi previsto                   | E1-E2                |
| Individuare spazi liberi                      | Pianificata    | Phase E                                        | E2                   |
| Proporre quando svolgere una task             | Pianificata    | Phase E                                        | E2                   |
| Rispettare turni, sonno, impegni e preferenze | Parziale       | vincoli generici/turni previsti; sonno assente | E2, arricchito da N1 |
| Riprogrammare incomplete                      | Mancante       | assente                                        | E3                   |
| Evitare sovraccarichi                         | Mancante       | assente                                        | E2                   |
| Conferma per modifiche significative          | Pianificata    | preview/apply previsto                         | E3                   |
| Motivo della riprogrammazione                 | Mancante       | assente                                        | E3                   |

## 9. Google Calendar

| Funzione                               | Stato iniziale | Evidenza / gap                                    | Collocazione    |
| -------------------------------------- | -------------- | ------------------------------------------------- | --------------- |
| OAuth sicuro e collegamento calendario | Pianificata    | H export-only                                     | H1              |
| Export eventi Tessavio                 | Pianificata    | H export-only                                     | H1              |
| Mapping stabile                        | Pianificata    | master plan H                                     | H1              |
| Update/delete idempotenti              | Parziale       | export idempotente generico, delete non esplicito | H1              |
| Outbox e retry                         | Parziale       | Queue/retry previsti, outbox non nominata         | H1              |
| Riconciliazione                        | Mancante       | assente                                           | H2              |
| Import modifiche Google                | Mancante       | escluso dal piano                                 | H2              |
| Sincronizzazione bidirezionale         | Mancante       | esplicitamente fuori scope                        | H3              |
| Gestione conflitti                     | Parziale       | conflict logging solo export                      | H2-H3           |
| Timezone, all-day e ricorrenze         | Mancante       | non dettagliati in H                              | H1-H3           |
| Disconnessione e revoca                | Pianificata    | già prevista                                      | H1              |
| Adapter fake senza credenziali         | Parziale       | provider test previsto genericamente              | H1-H3           |
| D1 fonte autorevole                    | Pianificata    | invariante/architettura già presenti              | ADR-0011, H1-H3 |

## 10. Viaggi e spostamenti

| Funzione                                       | Stato iniziale | Evidenza / gap                                | Collocazione                   |
| ---------------------------------------------- | -------------- | --------------------------------------------- | ------------------------------ |
| Viaggio, date e tappe                          | Mancante       | travel mode era futuro generico               | M1                             |
| Prenotazioni inserite/inoltrate                | Mancante       | assenti                                       | D3/M2                          |
| Documenti viaggio                              | Mancante       | assenti                                       | J2/M2                          |
| Indirizzi e check-in                           | Mancante       | assenti                                       | M1-M2                          |
| Budget e spese viaggio                         | Mancante       | assenti                                       | M3 con link a finanze          |
| Partecipanti                                   | Mancante       | assenti                                       | M1 con scope privato/shared    |
| Attività                                       | Mancante       | assenti                                       | M1 con link a task/eventi      |
| Lista valigia e lista spesa                    | Mancante       | assenti                                       | M3 con link a liste            |
| Cose da fare prima della partenza              | Mancante       | assenti                                       | M3 con link a task             |
| Riepilogo itinerario                           | Mancante       | assente                                       | M3                             |
| Nessuna dipendenza da mappe/meteo/prenotazioni | Mancante       | travel era rinviato insieme alle integrazioni | M1-M3 + integrazioni differite |

## 11. Routine e benessere

| Funzione                            | Stato iniziale | Evidenza / gap                                  | Collocazione      |
| ----------------------------------- | -------------- | ----------------------------------------------- | ----------------- |
| Routine mattutine e serali          | Parziale       | routine generiche nel prodotto, non concrete    | N1                |
| Abitudini                           | Mancante       | habit tracker dichiarato non-obiettivo iniziale | N1                |
| Allenamenti                         | Mancante       | assenti                                         | N1                |
| Farmaci e integratori come reminder | Mancante       | assenti                                         | N2                |
| Acqua                               | Mancante       | assente                                         | N1                |
| Sonno e pause                       | Mancante       | assenti                                         | N1                |
| Visite e controlli                  | Mancante       | assenti                                         | N2                |
| Energia percepita                   | Mancante       | assente                                         | N3                |
| Adattamento orari dai completamenti | Mancante       | assente                                         | N3                |
| Nessuna diagnosi/prescrizione       | Mancante       | limite non dichiarato                           | PROJECT/N2-N3/DoD |

## 12. Integrazioni differite

| Integrazione             | Stato iniziale | Esito                                     |
| ------------------------ | -------------- | ----------------------------------------- |
| Gmail                    | Mancante       | differita; nessuna dipendenza dei domini  |
| Google Drive             | Mancante       | differita; documenti locali prima         |
| Google Contacts          | Mancante       | differita; persone interne prima          |
| Google Tasks             | Mancante       | differita; task locali prima              |
| Meteo                    | Mancante       | differita; viaggio locale prima           |
| Mappe e navigazione      | Mancante       | differita; viaggio locale prima           |
| Piattaforme prenotazione | Mancante       | differita; prenotazioni manuali prima     |
| Spedizioni               | Mancante       | differita                                 |
| Supermercati/cataloghi   | Mancante       | differita; casa/pasti locali prima        |
| Dispositivi              | Mancante       | differita; benessere manuale prima        |
| Posizione via Mini App   | Mancante       | differita                                 |
| Altri servizi terzi      | Mancante       | richiedono decisione e milestone separata |

## Sintesi operativa

- **Implementato:** foundation A1, preferenze temporali B1.1, eventi one-off
  B1.2 con viste agenda giornaliere e reminder end-to-end B2; le entità
  successive restano non implementate.
- **Già pianificato in modo significativo:** core B, AI C, voice/vision D,
  planner E, sharing F, Mini App, Google export e hardening.
- **Parziale o assente prima dell'audit:** Inbox universale completa, entrate e
  finanza avanzata, briefing, documenti, persone, casa/famiglia, viaggi,
  benessere e Google inbound/two-way.
- **Dopo l'aggiornamento:** ogni requisito sopra ha una milestone concreta, ma
  resta non implementato finché i relativi acceptance test e gate DoD non sono
  verdi.
