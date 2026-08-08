# Recovery B1.1 — preferenze temporali

Non copiare nei log testo dei comandi o token Undo. Usare solo user ID interni,
correlation ID e codici di esito.

## Contratto comandi

```text
/impostazioni
/impostazioni imposta it Europe/Rome 24h EUR
/annulla <token-opaco>
```

La creazione e l'aggiornamento richiedono lingua, timezone IANA, formato ora e
valuta. Il profilo è privato; input incompleti, offset come `+02:00`, timezone
inesistenti, lingue/formati non supportati e valute non riconosciute non
producono una mutation.

## Rollout migration

La migration `0001_many_ben_urich.sql` è additiva. Prima del rollout remoto:

1. esportare il database secondo il runbook D1 e conservare l'identificatore del
   backup, senza scaricare dati in ticket o log condivisi;
2. eseguire `npm run db:check` e la suite integration su database vuoto;
3. provare localmente sia l'applicazione sequenziale `0000 -> 0001` sia una
   fresh migration completa;
4. applicare prima in staging e verificare tabelle, indici, create/read/update e
   Undo con account sintetici distinti;
5. osservare errori D1 e latenza prima di procedere oltre.

Non eseguire un down migration distruttivo in produzione. Se l'applicazione
deve essere ritirata, il codice precedente ignora le nuove tabelle. Se la
migration ha corrotto o bloccato dati, fermare i consumer, ripristinare il backup
D1 verificato oppure distribuire una migration correttiva forward-only.

## Diagnosi redatta

Le query operative devono includere `user_id` o `scope_user_id`. Verificare lo
stato di un singolo utente interno senza leggere i valori personali:

```sql
SELECT version, updated_at
FROM user_preferences
WHERE user_id = ?;

SELECT consumed_at IS NOT NULL AS consumed, expires_at
FROM preference_undo_actions
WHERE scope_user_id = ? AND token = ?;
```

Un Undo `stale` indica che `user_preferences.version` non coincide più con
`expected_version`: non forzare il ripristino e non modificare le versioni a
mano. Un replay `used` non deve essere riaperto. Un token `expired` può essere
eliminato con la purge bounded del repository; la purge è sempre user-scoped e
idempotente.

## Retention

`user_preferences` resta fino alla cancellazione dell'account. Il token Undo
scade dopo 15 minuti; i record scaduti vengono eliminati opportunisticamente, al
massimo 100 per richiesta e solo per lo scope autorizzato. L'audit non viene
eliminato insieme al token e segue la retention core approvata.
