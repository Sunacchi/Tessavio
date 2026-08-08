# Milestone corrente — B5 Finanze base (completata)

**Stato: completata localmente il 2026-08-08.** B1-B5 sono completate. B6 è la
prossima milestone prevista ma non è attivata: nessun suo schema o adapter è
autorizzato. Nessuna risorsa Cloudflare remota è stata creata e nessun deploy è
stato eseguito.

## Obiettivo

Permettere a un utente Telegram di registrare, leggere, correggere ed eliminare
spese ed entrate manuali e ottenere totali esatti per valuta, senza AI,
integrazioni esterne o aritmetica floating point.

## Contratto autorizzato

- ogni movimento è privato e usa `UserScope`; `expense|income` è una direzione
  esplicita e l'importo è sempre positivo;
- `amount_minor` è un intero tra 1 e 2.147.483.647 e il comando lo acquisisce già
  in unità minori; valuta è un codice maiuscolo di tre lettere e non esiste
  conversione valutaria;
- la data economica è un giorno civile `YYYY-MM-DD`; categoria è obbligatoria,
  esercente, metodo di pagamento e note sono facoltativi e bounded;
- provenance è `manual_command`; B5 non accetta write da AI, voce, immagini,
  documenti o import;
- la correzione sostituisce i campi modificabili soltanto se la versione attesa
  coincide; la cancellazione è soft e richiede la stessa stale-version policy;
- lista e totali usano periodi civili inclusivi di massimo 366 giorni. Le valute
  restano separate; entrate, spese e netto usano somme testuali D1 e `bigint`;
- ogni create/correzione/delete è autorizzata, idempotente e atomica con audit e
  Undo `fin_…` single-use di 15 minuti. Undo della create rimuove il movimento;
  Undo di correzione/delete ripristina la snapshot precedente con nuova versione;
- movimenti attivi/eliminati e audit restano fino alla cancellazione account;
  gli Undo scaduti hanno purge bounded user-scoped e nessun contenuto economico
  entra nei log.

Comandi espliciti (`/spese` è alias di `/finanze`):

```text
/finanze crea <spesa|entrata> <importo-minore> <valuta> <YYYY-MM-DD> | Categoria | Esercente-o-- | Metodo-o-- | Note-o--
/finanze leggi <id>
/finanze lista <YYYY-MM-DD> <YYYY-MM-DD>
/finanze correggi <id> <versione> <spesa|entrata> <importo-minore> <valuta> <YYYY-MM-DD> | Categoria | Esercente-o-- | Metodo-o-- | Note-o--
/finanze elimina <id> <versione>
/finanze totali <YYYY-MM-DD> <YYYY-MM-DD>
/annulla fin_<token>
```

## Exit criteria

- create/read/list/correct/delete/totals funzionano senza AI, preferenze o
  integrazioni esterne;
- retry non duplica movimento, audit o Undo, incluso il crash window dopo write
  D1 e prima della risposta Telegram;
- correzione/delete/Undo coprono stale version, replay, expiry e isolamento
  cross-user;
- importi non usano `float`; property test verificano entrate, spese e netto su
  più valute e quantità generate;
- record eliminati non compaiono in read/list/totals; Undo li ripristina senza
  riusare una versione precedente;
- migration fresh e upgrade da B4 popolata, vincoli monetari, indici/query plan
  e recovery sono documentati e testati;
- test unitari/property, integrazione, security, migration e gate completi sono
  verdi.

## Out of scope

- importi in unità maggiori/decimali, catalogo esponenti valuta e conversione FX;
- categorie automatiche o regole personali, ricorrenze, stipendio/affitto/utenze
  come entità programmate, rate e abbonamenti;
- budget, obiettivi, scadenziario, forecast, confronti e consulenza finanziaria;
- split, spese condivise, debiti, crediti, prestiti o pagamenti;
- import/export CSV, voce, ricevute, scontrini, bollette e documenti;
- Open Banking, conti, saldi bancari, credenziali, provider o polling.

## Evidenza di chiusura

La vertical slice comprende parser e routing deterministici, dominio monetario
puro, `finance:read|write|undo`, repository D1 tenant-scoped, audit/Undo,
migration additiva `0006_puzzling_vanisher.sql`, soft delete e totali per valuta.
I test coprono aritmetica property-based, fresh migration e upgrade B4 popolato,
indici/query plan, retry Queue dopo write committata, cross-tenant, vincoli D1,
stale/replay/expiry/Undo e assenza di tabelle Open Banking.
