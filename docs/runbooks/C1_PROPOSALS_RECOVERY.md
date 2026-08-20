# Runbook C1 — ActionProposal, migration e recovery

## Scope

Copre la slice C1: envelope `AI_PROPOSAL`, tabelle `ai_proposal_jobs` e
`ai_proposal_confirmations`, colonna `provenance` su eventi, promemoria e task,
ledger `effects` esteso con `ai_execution`. **Non** copre OAuth, credenziali
utente, provider reali o budget monetario: quelli sono C2. In C1 l'unico
provider è il mock deterministico, che non fa rete e non costa nulla.

## Rollout locale

1. esportare D1 secondo [D1_PROVISIONING](D1_PROVISIONING.md);
2. applicare `0009_blue_kingpin.sql` a una copia B7 popolata e verificare che i
   conteggi B1-B7 siano invariati e che le righe esistenti abbiano
   `provenance = 'entered'`;
3. la migration **ricostruisce `effects`** per estendere il CHECK su `kind`:
   verificare che il ledger preesistente sia integro prima di proseguire;
4. avviare il Worker con `AI_PROVIDER=mock` e provare
   `/ai`, `/ai proponi ricordami di chiamare il dentista domani alle 9`,
   `/ai conferma <token>`;
5. rimuovere tutte le variabili `AI_*` e verificare che il Worker parta lo
   stesso, che `/oggi` funzioni e che `/ai` risponda "non configurata".

## Diagnosi senza contenuto personale

Non selezionare `plan_json`, `reply_text` né il testo del messaggio: contengono
contenuto dell'utente. Usare stati, versioni e conteggi.

```sql
SELECT status, COUNT(*) FROM ai_proposal_jobs
WHERE user_id = ? GROUP BY status;

SELECT failure_code, COUNT(*) FROM ai_proposal_jobs
WHERE user_id = ? AND status = 'failed' GROUP BY failure_code;

SELECT status, COUNT(*) FROM ai_proposal_confirmations
WHERE user_id = ? GROUP BY status;

SELECT kind, status, COUNT(*) FROM effects
WHERE scope_user_id = ? GROUP BY kind, status;
```

## Scenari

**Il job resta in `claimed` e l'utente non riceve risposta.** Il lease è scaduto
mentre il provider rispondeva. Il retry della Queue rinnova il lease e riprende:
se lo stato è `planned`, la ripresa **rilegge il piano** e non richiama il
modello. Se il job resta bloccato oltre due retry, verificare che
`AI_LEASE_SECONDS` sia maggiore della latenza p95 del provider.

**Doppia risposta o doppia scrittura.** Non deve accadere: le proposte sono
persistite prima dell'esecuzione e ogni esecuzione passa dal ledger `effects`
con chiave `ai-exec:{jobId}:{index}`. Se accade, cercare due `job_id` diversi
per lo stesso `idempotency_key`: significa che il comando `/ai proponi` è stato
pubblicato due volte con jobId diversi, non che l'idempotenza ha fallito.

**`failure_code = 'invalid_json'` o `'schema_violation'`.** L'output del provider
non era interpretabile: **nessuna scrittura è avvenuta**. All'utente è stato
proposto un comando esplicito. Se il tasso supera qualche caso isolato,
rieseguire il benchmark prima di cambiare prompt o modello.

**Conferme che scadono senza essere usate.** TTL predefinito 15 minuti
(`AI_CONFIRMATION_TTL_MINUTES`). Un token scaduto o già usato non esegue nulla:
è il comportamento atteso, non un incidente.

**Sospetto di prompt injection.** Il contenuto utente è sempre dato, mai
istruzione: l'enum è chiuso, il validator riautorizza e le azioni distruttive
restano in preview. Verificare che `plan_json` non contenga azioni fuori enum —
se ne contiene, è un difetto dello schema, non della policy: aprire un
regression test prima del fix.

## Retention

`ai_proposal_jobs` 30 giorni (`AI_PROPOSAL_RETENTION_DAYS`), token di conferma
alla scadenza. La purge gira nel Cron di manutenzione, è idempotente e bounded a
200 righe per esecuzione. Con AI disabilitata la purge non gira: le tabelle
restano vuote.

## Rollback

La migration è additiva per eventi, promemoria e task: un Worker N-1 continua a
funzionare sullo schema N (la colonna `provenance` ha un default). Le tabelle AI
sono nuove e inutilizzate da N-1. Per fermare la superficie AI senza rollback di
schema è sufficiente rimuovere `AI_PROVIDER` dalle variabili: il prodotto torna
in NO_AI.

## Verifica

```powershell
npm run validate
npm run bench
```

Il benchmark confronta il dataset `benchmark/datasets/c1-core.jsonl` con la
baseline in `benchmark/baselines/c1-mock-v1.json`. La baseline del mock misura
l'harness (schema, validator, policy, risoluzione degli slot), non la qualità di
un modello: serve come pavimento per il confronto quando un provider reale gira
lo stesso dataset in C2.
