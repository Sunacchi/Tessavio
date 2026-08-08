# Data and privacy policy baseline

## Retention proposta

| Dato                     | Default                                   |
| ------------------------ | ----------------------------------------- |
| audio raw                | eliminato subito dopo STT                 |
| immagine raw             | eliminata subito dopo extraction          |
| PDF/documento raw Inbox  | eliminato dopo extraction                 |
| documento archiviato     | solo opt-in/use case; fino a delete       |
| estratto/provenance      | con l'entità utile; policy di dominio     |
| prompt raw nei log       | disabilitato                              |
| testo normalizzato inbox | 7 giorni per A1                           |
| ActionProposal           | 30-90 giorni, da approvare prima di C     |
| effect/delivery A1       | 30 giorni                                 |
| audit identità A1        | minimo 90 giorni; approvazione produzione |
| preferenze temporali B1  | fino a cancellazione utente               |
| token Undo preferenze    | TTL 15 minuti; purge bounded user-scoped  |
| reminder B2              | fino a cancellazione utente               |
| token Undo reminder      | TTL 15 minuti; purge bounded user-scoped  |
| delivery notification B2 | 30 giorni; purge da attivare pre-pilot    |
| lavoro B4                | fino a cancellazione utente               |
| token Undo lavoro        | TTL 15 minuti; purge bounded user-scoped  |
| movimenti finanza B5     | fino a cancellazione utente               |
| token Undo finanze       | TTL 15 minuti; purge bounded user-scoped  |
| dati core                | fino a cancellazione utente               |
| metadata AI usage        | quanto necessario a budget e report       |
| OAuth Google             | fino a revoca/disconnessione              |
| cursor/outbox Google     | minimo per sync, dedupe e recovery        |

Conservare il risultato utile, non il materiale originale. La persistenza di un
documento originale è separata dall'acquisizione Inbox, esplicita e cifrata. Le
durate esatte di documento, estratto, link cross-domain, proposte, outbox e sync
metadata sono gate della milestone che introduce la categoria e devono essere
approvate prima di produzione.

In A1 Telegram viene ridotto a update ID, ID numerici necessari, tipo chat,
timestamp e testo del comando. Nome, username e payload raw vengono scartati al
confine. Rate bucket e lease scadono rispettivamente entro due finestre e 30
secondi; user/identity restano fino al percorso di cancellazione account. La
purge periodica dei record a 7/30/90 giorni è un gate pre-beta e non è ancora una
promessa di deploy production.

In B1.1 il profilo conserva soltanto lingua, timezone IANA, formato ora e valuta
predefinita. I token Undo sono UUID opachi, legati all'utente e mai inseriti nei
log; scadono dopo 15 minuti e la loro purge non elimina l'audit della mutation.
Non è stato inventato alcun toggle privacy ulteriore: le preferenze di briefing,
AI e condivisione entrano solo nelle rispettive slice autorizzate.

In B1.2 gli eventi sono privati e conservano titolo, stato/versione e una sola
forma temporale: `local_date` per i date-only, oppure instant UTC e timezone IANA
originale per gli eventi con ora. I token Undo `evt_…` scadono dopo 15 minuti e
non entrano nei log. Eventi attivi e annullati restano fino alla cancellazione
account; la slice non introduce delete irreversibile, reminder o condivisione.

In B2 i reminder sono privati e conservano testo scelto dall'utente, instant UTC
richiesto/effettivo, timezone IANA originale, stato/versione e metadati minimi di
claim/delivery. Lo snapshot per quiet hours contiene soltanto versione profilo e
minuti locali, non una copia del profilo. Il testo viene letto per l'invio ma non
entra in log, delivery ledger o DLQ diagnostica. I token `rem_…` scadono dopo 15
minuti; reminder e audit restano fino alla cancellazione account, mentre la purge
del ledger notification a 30 giorni è un gate pre-pilot.

In B4 regole, turni pianificati, consuntivi e pause sono privati. Conservano
soltanto etichette inserite, intervalli UTC con timezone originale, versioni e lo
snapshot minimo della regola necessario a riprodurre i report. I report sono
calcolati e non persistono una copia dei contenuti. I token `wrk_…` scadono dopo
15 minuti e non entrano nei log; i dati lavoro e l'audit restano fino alla
cancellazione account.

In B5 i movimenti economici sono privati e conservano direzione, importo in
unità minori, valuta, data civile, categoria, campi facoltativi scelti
dall'utente, provenance manuale, stato e versione. Le cancellazioni ordinarie
sono soft per consentire Undo; record attivi/eliminati e audit restano fino alla
cancellazione account. I token `fin_…` scadono dopo 15 minuti, non entrano nei
log e hanno purge bounded user-scoped. Diagnostica e metriche non includono
categoria, esercente, metodo, note o snapshot audit.

## Diritti e operazioni

Il prodotto commerciale deve supportare accesso, rettifica, export,
cancellazione e revoca integrazioni. Export minimo JSON; CSV per lavoro, finanze,
eventi, task e altri domini tabellari pertinenti.

La cancellazione account richiede conferma, revoca integrazioni, rimozione
credenziali e dati attivi, gestione retention infrastrutturale e conservazione
del solo audit legalmente necessario.

L'export distingue dati inseriti, dati estratti con provenance, stime e relazioni
condivise. La cancellazione di una risorsa collegata non lascia contenuto
personale ricercabile tramite indici, cache, outbox o copie di briefing. Un
tombstone minimo può sopravvivere solo per dedupe/recovery e non contiene il
payload cancellato.

## Classificazione e minimizzazione

| Categoria           | Esempi                              | Regola minima                                                |
| ------------------- | ----------------------------------- | ------------------------------------------------------------ |
| identità esterna    | Telegram ID                         | mappare a ID interno; niente username/telefono come chiave   |
| organizzazione      | eventi, task, liste, viaggi         | privato per default; scope esplicito                         |
| economica           | movimenti, budget, debiti, forecast | minor unit; niente dati bancari; preview export/import       |
| documento sensibile | identità, assicurazioni, contratti  | cifratura, accesso bounded, provenance e retention esplicita |
| relazionale         | persone, note, follow-up            | niente CRM/profilazione esterna; context minimization        |
| benessere           | farmaci-reminder, sonno, energia    | dato sensibile; nessuna inferenza clinica o invio superfluo  |
| condivisa           | famiglia, casa, split               | membership/ruolo; revoca e delete policy esplicite           |

Briefing e notifiche usano il minimo contenuto necessario e rispettano quiet
hours. La dedupe impedisce ripetizioni, ma non giustifica retention illimitata
del testo notificato.

## Processor map pre-lancio

La [matrice di residenza e subprocessori](PROCESSOR_AND_RESIDENCY_MATRIX.md) è
un gate pre-pilot: documenta categorie/finalità, controparte, regione,
trasferimenti, retention, delete e misure per Telegram, Cloudflare, OpenRouter e
provider AI sottostante. `jurisdiction=eu` del D1 non regionalizza gli altri
passaggi. Google Calendar entra quando collegato; le integrazioni differite
soltanto con una milestone autorizzata. Open Banking non entra perché escluso.

La DPIA è registrata come gate pre-pilot per dati altamente personali/sensibili
e uso AI. Deve essere completata prima del trattamento reale, avere owner,
approvazione e data di riesame; rischi elevati residui richiedono la procedura
prevista dall'articolo 35 GDPR prima di procedere.

## Trasparenza AI

L'onboarding dichiara che i modelli interpretano alcuni messaggi mentre dati e
azioni sono gestiti dal software e controllabili/annullabili. I piani AI sono
suggerimenti, non decisioni oggettive.

Le estrazioni da documenti mostrano provenance e consentono correzione. Le
previsioni finanziarie dichiarano dati e periodo usati e sono etichettate come
stime, non consulenza. Le proposte di adattamento benessere non sono diagnosi o
trattamenti. La revisione legale resta obbligatoria prima della
commercializzazione.
