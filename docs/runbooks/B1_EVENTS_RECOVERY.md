# Recovery B1.2 — eventi one-off

Non copiare nei log titoli, testo dei comandi o token Undo. Usare soltanto ID
interni, correlation ID, stato/versione e codici di esito.

## Contratto comandi

```text
/evento crea data YYYY-MM-DD | Titolo
/evento crea ora YYYY-MM-DDTHH:mm YYYY-MM-DDTHH:mm | Titolo
/evento leggi <event-id>
/evento modifica <event-id> data YYYY-MM-DD | Titolo
/evento modifica <event-id> ora YYYY-MM-DDTHH:mm YYYY-MM-DDTHH:mm | Titolo
/evento annulla <event-id>
/annulla <token-opaco>
/oggi
/domani
```

Il titolo dopo `|` è obbligatorio. `data` conserva un giorno civile senza
timezone o mezzanotte artificiale. `ora` richiede inizio e fine completi, usa la
timezone IANA delle preferenze e conserva gli instant UTC più la timezone
originale. La fine è esclusiva. Gap e fold DST vengono rifiutati; non scegliere
manualmente un offset o modificare gli instant nel database.

## Dipendenza temporale e probe

Con `workerd@1.20260801.1` e compatibility date `2026-08-08`, un test eseguito
nel pool Workers ha restituito `typeof Temporal === "undefined"`. La release
stabile verificata il 2026-08-08 è `@js-temporal/polyfill@0.5.1`, fissata nel
manifest e nel lockfile. Quando il runtime espone Temporal standard, ripetere i
test DST e il dry-run build prima di valutare la rimozione; non mantenere due
implementazioni.

## Rollout migration

La migration `0002_cheerful_ben_grimm.sql` è additiva e crea `events`,
`event_undo_actions` e gli indici scoped. Prima del rollout remoto:

1. esportare D1 secondo il runbook di provisioning e registrare solo l'ID del
   backup;
2. eseguire `npm run db:check`, test unit/integration/security e dry-run build;
3. provare sia un database vuoto (`0000 -> 0001 -> 0002`) sia l'upgrade di una
   copia B1.1 (`0000 -> 0001`, poi `0002`);
4. applicare in staging, creare un evento sintetico date-only e uno instant,
   quindi provare read/update/cancel/Undo e `/oggi` con due utenti distinti;
5. controllare p95 D1, errori, Queue retry e i query plan degli indici
   `events_scope_date_idx`, `events_scope_instant_idx` e
   `event_undo_scope_expiry_idx` prima di procedere.

Non eseguire down migration distruttive in produzione. Il codice B1.1 ignora le
nuove tabelle, quindi un rollback applicativo è possibile lasciando lo schema
additivo. Se la migration ha corrotto o bloccato dati, fermare i consumer e
ripristinare il backup verificato oppure distribuire una migration correttiva
forward-only.

## Diagnosi redatta

Ogni query operativa deve includere `user_id` o `scope_user_id`:

```sql
SELECT event_kind, status, version, updated_at
FROM events
WHERE user_id = ? AND id = ?;

SELECT consumed_at IS NOT NULL AS consumed, expected_version, expires_at
FROM event_undo_actions
WHERE scope_user_id = ? AND token = ?;
```

`stale` indica che la versione corrente non coincide con `expected_version`:
non forzare l'Undo e non correggere la versione a mano. `used` è definitivo.
Una risposta Telegram retryable può far rientrare la stessa mutation: l'audit
con la stessa idempotency key deve restare singolo e la ricevuta originale deve
essere riutilizzata.

## Retention

Eventi attivi e annullati restano fino alla cancellazione account; B1.2 non
espone delete irreversibile. I token `evt_…` scadono dopo 15 minuti e i record
Undo scaduti vengono eliminati opportunisticamente, al massimo 100 per richiesta
e solo nello scope autorizzato. La purge è idempotente e non elimina eventi o
audit. L'audit segue la retention core approvata.
