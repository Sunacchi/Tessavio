# Runbook B6.1 — Liste/note, migration e recovery

## Scope

Questo runbook copre la migration B6.1, liste private, item, note, soft delete e
Undo. Non autorizza provisioning o deploy remoto, condivisione, ricorrenze,
allegati, ricerca o operazioni bulk.

## Rollout locale/staging

1. esportare D1 secondo il runbook di provisioning;
2. applicare `0007_wide_phalanx.sql` a una copia B5 popolata e verificare che
   conteggi e record B1-B5 siano invariati;
3. distribuire il Worker compatibile con schema B5+B6.1;
4. creare una lista, aggiungere/completare/riaprire/rimuovere un item, poi
   eliminare e ripristinare la lista; creare/modificare/eliminare una nota;
5. verificare duplicate idempotency key, stale version, expiry/replay Undo,
   lista non vuota e isolamento con un secondo utente;
6. verificare gli indici hot con `EXPLAIN QUERY PLAN`.

## Diagnosi senza contenuto personale

Non selezionare o loggare titolo, testo item, corpo nota, `before_json` o
`after_json`. Usare ID, stati, versioni e conteggi:

```sql
SELECT status, COUNT(*) FROM lists
WHERE user_id = ? GROUP BY status;

SELECT status, COUNT(*) FROM list_items
WHERE user_id = ? AND list_id = ? GROUP BY status;

SELECT status, COUNT(*) FROM notes
WHERE user_id = ? GROUP BY status;

SELECT COUNT(*) FROM list_undo_actions
WHERE scope_user_id = ? AND expires_at <= ?;
```

## Failure e recovery

- **retry della stessa mutation:** riusare correlation ID e idempotency key; il
  repository restituisce la ricevuta già auditata senza seconde entità o Undo;
- **stale version:** rileggere nello stesso `UserScope`; non forzare update per
  ID nudo;
- **lista non vuota:** rimuovere esplicitamente ogni item e ripetere con la
  versione corrente della lista; non eseguire cascade manuali;
- **Undo stale/used/expired:** nessuna write viene applicata. Un Undo create
  lista è stale dopo la creazione di qualunque item, anche già eliminato;
- **FK item/lista:** verificare insieme `user_id` e `list_id`; non disabilitare le
  foreign key per aggirare un errore di scope;
- **batch D1 fallita:** mutation, audit e Undo sono atomici; correggere la causa
  e ripetere la stessa idempotency key;
- **shape incoerente:** non stampare contenuti; ripristinare una copia con Time
  Travel/export e confrontare migration, vincoli e audit.

## Rollback

La migration è additiva e il Worker B5 ignora le tabelle B6.1. Un rollback
applicativo può distribuire B5 lasciando i dati intatti. Non eseguire `DROP
TABLE` in produzione. Ripristinare in un database isolato, validare schema,
conteggi e audit e cambiare binding solo con approvazione.

## Query plan obbligatori

Verificare `lists_scope_status_created_idx`,
`list_items_scope_list_status_idx`, `notes_scope_status_created_idx` e
`list_undo_scope_expiry_idx`. Prima del pilot misurare p95, righe lette/scritte,
`overloaded` e crescita secondo il runbook pre-pilot.
