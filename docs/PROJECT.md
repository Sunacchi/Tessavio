# Visione e requisiti del prodotto

> Verità durevole di prodotto: **cosa** fa Tessavio e cosa non farà mai.
> Non contiene sequenze né autorizzazioni: quelle sono in
> [ROADMAP](planning/ROADMAP.md) e [CURRENT_MILESTONE](planning/CURRENT_MILESTONE.md).

## Obiettivo

Tessavio è un assistente personale conversazionale multiutente, usato
principalmente in Telegram. Acquisisce testo, messaggi inoltrati, vocali,
fotografie, screenshot, link e documenti supportati; mantiene però in D1 un
modello affidabile e verificabile della vita organizzativa dell'utente.

Esempio di input:

> Domani lavoro 6-14, appena esco devo passare in farmacia e alle 17 ho il
> dentista. Ricordamelo un'ora prima.

Il sistema ricava entità distinte: turno, task vincolata, evento e reminder. Il
testo o il media dell'utente non diventa mai una write diretta.

## Principi di prodotto

1. **Core AI-independent.** Agenda, reminder, task, lavoro, finanze, liste,
   routine, report e comandi espliciti continuano a funzionare senza provider AI.
2. **Multi-tenant dal giorno 1.** Ogni record appartiene a un utente o a uno
   spazio; il privato è il default e la condivisione richiede membership e
   autorizzazione esplicite.
3. **Credenziale AI delegata.** In produzione l'utente collega il proprio account
   OpenRouter via OAuth PKCE e Tessavio riceve una API key OpenRouter controllata
   dall'utente. È distinto dal BYOK di chiavi provider configurate dentro
   OpenRouter, che Tessavio non acquisisce. Il consumo non grava sul proprietario
   del bot.
4. **AI come interprete.** L'AI formula soltanto `ActionProposal[]` strutturate;
   validator, policy e servizi di dominio autorizzano e applicano.
5. **Privacy by default.** Contesto minimo, media grezzi transitori, niente prompt
   logging, cifratura per dati sensibili e ZDR quando compatibile.
6. **Undo e idempotenza.** Retry non duplicano le write; le operazioni
   reversibili si possono annullare.
7. **Tempo corretto.** Timezone IANA, date locali esplicite e casi DST testati.
8. **Denaro esatto.** Importi in unità minori intere e valuta esplicita; stime e
   previsioni sono presentate come tali, mai come consulenza finanziaria.
9. **Modular monolith.** Un solo prodotto modulare, senza microservizi prematuri.
10. **Auditability.** Ogni modifica significativa registra attore, azione,
    entità, prima/dopo e correlation ID.
11. **Cost awareness.** Ogni operazione AI rispetta capability, privacy, budget
    utente e costo massimo.
12. **Notifiche rispettose.** Briefing e avvisi rispettano preferenze, quiet
    hours e deduplica e non usano formulazioni ansiogene.

## Tessavio Inbox

La Inbox è il punto di acquisizione universale, non un nuovo dominio dati.
Normalizza il contenuto ricevuto, conserva la provenienza minima necessaria e lo
instrada verso comandi deterministici oppure verso una o più proposte tipizzate
per i moduli competenti.

Deve riconoscere progressivamente eventi, reminder, task, movimenti economici,
bollette, documenti, scadenze, liste, note, persone, contenuti da archiviare e
informazioni da riproporre. Un singolo input può produrre più proposte collegate,
ma ogni dominio mantiene le proprie regole e la propria persistenza.

Quando mancano dati essenziali, Tessavio pone una domanda breve e mirata. Quando
l'azione è non ambigua, reversibile e a basso rischio, una policy deterministica
può eseguirla mostrando esito e Undo. Azioni distruttive, bulk, condivise,
sensibili o incerte richiedono preview e conferma.

## Capacità di dominio approvate

Tutte le aree seguenti appartengono alla roadmap corrente del prodotto. La loro
presenza qui non autorizza implementazione parallela: entrano una vertical slice
alla volta secondo `docs/planning/ROADMAP.md`.

### Organizzazione personale

- preferenze, eventi, reminder, task, turni, liste, note e routine;
- briefing mattutino, riepiloghi serali/settimanali/mensili configurabili;
- planner deterministico con durate, passi, vincoli, finestre libere,
  riprogrammazione motivata e preview delle modifiche significative;
- elementi incompleti, scadenze, priorità e follow-up riproposti senza spam.

### Finanze personali

- spese ed entrate manuali via testo e voce, poi estrazione da ricevute,
  scontrini e bollette;
- importo, valuta, data, categoria modificabile, esercente, note e metodo di
  pagamento facoltativo;
- regole personali, ricorrenze, stipendio, affitto, utenze, abbonamenti e rate;
- budget complessivi/per categoria, obiettivi di risparmio e fondi futuri;
- scadenziario, previsioni basate sui dati registrati, confronti e riepiloghi;
- spese condivise, split, debiti, crediti e prestiti personali;
- export CSV, import CSV manuale, modifica, cancellazione e Undo.

### Documenti e amministrazione personale

- bollette, ricevute, scontrini, garanzie, assicurazioni, documenti veicolo,
  contratti, prenotazioni, certificati e documenti personali/casa;
- classificazione, estrazione con provenienza, importi/scadenze, ricerca e
  reminder;
- collegamenti espliciti a spesa, evento, persona, veicolo, casa o viaggio;
- archivio derivato o documento cifrato solo quando necessario e autorizzato,
  con retention, export e cancellazione definiti. Audio e immagini restano
  transitori per default.

### Persone e relazioni

- persone gestite internamente senza dipendere da Google Contacts;
- compleanni, anniversari, ultime interazioni, cose da chiedere, promesse,
  follow-up, regali, oggetti o denaro prestati e note personali;
- collegamenti a eventi, task, spese e altri oggetti, senza diventare un CRM
  aziendale.

### Casa, famiglia e spazi condivisi

- calendario familiare, liste condivise, spese, faccende, manutenzione,
  scadenze domestiche, animali e appuntamenti dei figli;
- viaggi/vacanze, pasti, inventario domestico, prodotti da ricomprare o in
  scadenza, preferenze alimentari, allergie/esclusioni, ricette e lista della
  spesa derivata dal piano pasti;
- ogni dato privato per default, condiviso solo tramite `SpaceScope`, membership
  e ruolo espliciti.

### Viaggi e spostamenti

- viaggio manuale/conversazionale con date, tappe, prenotazioni inoltrate,
  documenti, indirizzi, check-in, budget, spese, partecipanti e attività;
- itinerario, lista valigia/spesa e attività pre-partenza senza dipendere da API
  di mappe, meteo, trasporti o prenotazioni.

### Routine e benessere

- routine mattutine/serali, abitudini, allenamenti, acqua, sonno, pause, visite,
  controlli ed energia percepita;
- farmaci e integratori soltanto come promemoria configurati dall'utente;
- adattamento prudente degli orari in base ai completamenti, con spiegazione e
  controllo utente;
- nessuna diagnosi, prescrizione o sostituzione di medici e professionisti.

## Integrazioni esterne

### Google Calendar

Google Calendar è parte della roadmap corrente con livelli di affidabilità
espliciti: OAuth sicuro, export controllato, mapping stabile, outbox/retry,
riconciliazione, import delle modifiche e infine sincronizzazione bidirezionale
con gestione dei conflitti. D1 resta sempre la fonte autorevole del dominio
Tessavio; nessun last-write-wins cieco.

### Integrazioni differite

Gmail, Google Drive, Google Contacts, Google Tasks, meteo, mappe/navigazione,
prenotazioni, spedizioni, supermercati/cataloghi, dispositivi e posizione via
Mini App sono integrazioni successive. I relativi domini Tessavio funzionano
prima e senza tali servizi.

### Esclusione definitiva di Open Banking

Tessavio non collega conti correnti, non sincronizza banche, non raccoglie
credenziali bancarie, non usa provider PSD2/AISP/PISP e non dispone pagamenti.
Non verranno creati adapter, dipendenze o tabelle speculative per Open Banking.
L'import CSV manuale è ammesso e non costituisce integrazione bancaria.

## Esperienza utente

L'interazione è conversation-first. I comandi (`/oggi`, `/domani`, `/task`,
`/lavoro`, `/spese`, `/liste`, `/report`, `/impostazioni`, `/privacy`, `/ai`,
`/annulla`) sono scorciatoie e fallback deterministici.

Ogni risposta distingue fatti registrati, dati estratti, assunzioni e stime. Le
previsioni economiche descrivono soltanto i dati disponibili. Notifiche e
briefing sono concise, configurabili e deduplicate.

## Stato e sequenza

La destinazione di prodotto è descritta nella
[roadmap](planning/ROADMAP.md), mentre la sola fase autorizzata è nella
[milestone corrente](planning/CURRENT_MILESTONE.md). La
[matrice di copertura](planning/REQUIREMENTS_COVERAGE.md) distingue ciò che è
implementato e testato da ciò che è soltanto pianificato.

## Non-obiettivi

- Open Banking, pagamenti automatici e disposizione di denaro;
- billing commerciale;
- CRM aziendale;
- diagnosi, prescrizioni o consulenza medica/finanziaria;
- microservizi, sharding o Workflow senza necessità misurata;
- conservazione indiscriminata di raw media o documenti;
- modelli AI hardcoded o managed AI plan.

## Provenienza

Baseline derivata dalla specifica V3, aggiornata con la revisione requisiti del
2026-08-08. Versioni, prezzi, quote, normativa e API esterne devono essere
ricontrollati prima di dipendere da esse.
