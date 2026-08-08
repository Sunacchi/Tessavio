# Milestone corrente — B4 Lavoro (completata)

**Stato: completata localmente il 2026-08-08.** B1-B4 sono completate. B5 è la
prossima milestone prevista ma non è attivata: nessun suo schema o adapter è
autorizzato. Nessuna risorsa Cloudflare remota è stata creata e nessun deploy è
stato eseguito.

## Obiettivo

Permettere a un utente Telegram di registrare separatamente turni pianificati,
consuntivi e pause, applicando una regola esplicita sul trattamento delle pause
e producendo report temporali riproducibili senza AI.

## Contratto autorizzato

- una regola lavoro privata dichiara se le pause sono `paid` oppure `unpaid`;
- un consuntivo conserva uno snapshot versionato della regola usata, così un
  report storico non cambia se la regola evolve in una milestone successiva;
- turni pianificati, consuntivi e pause sono entità e tabelle distinte;
- ogni intervallo è semiaperto `[start, end)`, conserva istanti UTC e timezone
  IANA originale e può attraversare mezzanotte o un cambio DST;
- input locali in un gap o fold DST vengono rifiutati; la durata massima di un
  singolo intervallo è 48 ore;
- una pausa deve appartenere a un consuntivo dello stesso utente, essere
  contenuta nel suo intervallo e non sovrapporsi a un'altra pausa;
- il report usa un periodo civile inclusivo di massimo 366 giorni, converte i
  confini in modo DST-safe e clampa ogni intervallo ai confini richiesti;
- i totali interi sono minuti pianificati, consuntivi lordi, pause e minuti
  conteggiati. Le pause `paid` restano conteggiate; le `unpaid` vengono sottratte.

Comandi espliciti:

```text
/lavoro regola crea <retribuita|non_retribuita> | Nome
/lavoro regola leggi <id>
/lavoro regole
/lavoro turno crea <YYYY-MM-DDTHH:mm> <YYYY-MM-DDTHH:mm> | Titolo
/lavoro turno leggi <id>
/lavoro consuntivo crea <inizio> <fine> <regola-id> | Titolo
/lavoro consuntivo leggi <id>
/lavoro pausa crea <consuntivo-id> <inizio> <fine>
/lavoro pausa leggi <id>
/lavoro giorno <YYYY-MM-DD>
/lavoro report <YYYY-MM-DD> <YYYY-MM-DD>
/annulla wrk_<token>
```

Ogni create è autorizzata, idempotente e atomica con audit e Undo single-use di
15 minuti. L'Undo elimina solo l'entità appena creata e fallisce `stale` se una
regola è già referenziata o un consuntivo ha già pause. Ogni accesso repository
richiede `UserScope`; i dati restano fino alla cancellazione account e gli Undo
scaduti vengono eliminati in batch bounded user-scoped.

## Exit criteria

- create/read/list/report funzionano senza AI o integrazioni esterne;
- piano, consuntivo e pause non si sovrascrivono e hanno scope esplicito;
- retry non duplica entità, audit o Undo;
- Undo copre replay, scadenza, stale version e isolamento cross-user;
- mezzanotte, giorni civili da 23/25 ore, gap/fold e intervalli clamped sono
  coperti da test unitari/property e integrazione;
- i report espongono timezone, policy/versione e record contributori;
- totali e formula restano visibili entro il limite Telegram; solo il dettaglio
  dei contributori può essere troncato esplicitamente;
- migration fresh/upgrade, indici hot, query plan e recovery sono documentati;
- format, lint, typecheck, unit, integration, security, migration, build e audit
  dipendenze sono verdi.

## Out of scope

- modifica o cancellazione persistente dopo la finestra Undo;
- retribuzione, valuta, tariffe, maggiorazioni, straordinari o buste paga;
- ricorrenze/rotazioni, import/export CSV, planner e collegamenti a task/eventi;
- condivisione, team, timbratura automatica, geolocalizzazione o integrazioni;
- parsing naturale, AI, reminder e notifiche dedicate.

## Evidenza di chiusura

La vertical slice comprende parser e routing deterministici, porte applicative,
repository D1 tenant-scoped, authorization `work:read|write|undo`, audit/Undo,
migration additiva `0005_milky_gargoyle.sql`, report bounded e integrazione dei
turni in `/oggi` e `/domani`. I test coprono fresh migration e upgrade da una
fixture B3 popolata, indici/query plan, cross-tenant, DST, clamp, retry Queue dopo
una write già committata, replay/expiry/stale e limiti di risposta.
