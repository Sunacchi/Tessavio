# Runbook B5 — Finanze base, migration e recovery

## Scope

Questo runbook copre la migration B5, movimenti manuali, correzione, soft delete,
totali per valuta e Undo. Non autorizza provisioning, deploy remoto, import CSV,
Open Banking o pagamenti.

## Rollout locale/staging

1. esportare D1 secondo il runbook di provisioning;
2. applicare `0006_puzzling_vanisher.sql` a una copia B4 popolata e verificare
   che conteggi e record B4 siano invariati;
3. distribuire il Worker compatibile con schema B4+B5;
4. creare spese ed entrate sintetiche in almeno due valute, correggere una riga,
   eliminarla e applicare Undo;
5. verificare retry con la stessa idempotency key, stale version, expiry/replay
   Undo e isolamento con un secondo utente;
6. confrontare i totali per valuta con gli importi registrati e verificare gli
   indici hot con `EXPLAIN QUERY PLAN`.

## Diagnosi senza contenuto economico

Non selezionare o loggare categoria, esercente, metodo, note, `before_json` o
`after_json`. Usare ID, stati, versioni e conteggi:

```sql
SELECT entry_kind, currency, status, COUNT(*)
FROM finance_entries
WHERE user_id = ?
GROUP BY entry_kind, currency, status;

SELECT COUNT(*) FROM finance_entries
WHERE user_id = ? AND status = 'active'
  AND local_date >= ? AND local_date <= ?;

SELECT COUNT(*) FROM finance_undo_actions
WHERE scope_user_id = ? AND expires_at <= ?;
```

## Failure e recovery

- **retry della stessa mutation:** riusare correlation ID e idempotency key; il
  repository restituisce la ricevuta già auditata senza seconde righe o Undo.
- **stale version:** rileggere il movimento nello stesso `UserScope`; non
  sovrascrivere o eliminare per ID nudo.
- **Undo stale/used/expired:** nessuna write viene applicata. Non modificare a
  mano token, versione o `consumed_at`.
- **totale inatteso:** verificare periodo inclusivo, stato `active`, direzione e
  valuta. Non unire valute e non convertire somme testuali in `Number`.
- **batch D1 fallito:** mutation, audit e Undo sono atomici; correggere la causa
  e ripetere la stessa idempotency key.
- **shape incoerente:** non stampare dati economici; ripristinare una copia con
  Time Travel/export e confrontare migration, vincoli e audit.

## Rollback

La migration è additiva e il Worker B4 ignora le tabelle B5. Un rollback
applicativo può distribuire B4 lasciando i dati intatti. Non eseguire `DROP
TABLE` in produzione. Ripristinare in un database isolato, validare
schema/conteggi/audit e cambiare binding solo con approvazione.

## Query plan obbligatori

Verificare `finance_entries_scope_date_idx` per lista/totali e
`finance_undo_scope_expiry_idx` per purge. Prima del pilot misurare p95, righe
lette/scritte, `overloaded` e crescita secondo il runbook pre-pilot.
