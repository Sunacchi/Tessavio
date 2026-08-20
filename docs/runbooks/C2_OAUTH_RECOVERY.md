# Runbook C2 — OAuth, credenziali, budget e recovery

## Scope

Copre la slice C2: router HTTP, sessione OAuth PKCE, envelope encryption della
credenziale BYOK, adapter OpenRouter, budget con prenotazione atomica e
`/ai collega` / `/ai scollega`. Non copre l'estensione dell'enum azioni (C1.2)
né l'Inbox testuale (C3).

**Stato dichiarato: verde in locale, smoke live pendente.** Il gate G0.2 ha
scelto l'opzione (b): nessuna risorsa Cloudflare remota, nessun deploy, server
OpenRouter **fake** nei test. Lo smoke con il provider reale è un passo
esplicito del proprietario ed è descritto qui sotto.

## Prerequisiti prima dello smoke live

1. un host pubblico HTTPS che serva il Worker, impostato in `AI_PUBLIC_BASE_URL`
   (senza barra finale);
2. `AI_PROVIDER=openrouter` e `AI_MODEL` fra quelli dell'allowlist in
   `src/ai/model-policy.ts`;
3. il secret `AI_KEK`: **32 byte casuali in base64**, generati fuori dal repo,
   con `AI_KEK_VERSION=1`;
4. `npm run validate` verde sulla revisione che si vuole provare.

Generazione della KEK (PowerShell, senza scriverla su disco in chiaro):

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

## Smoke live (passo del proprietario)

1. `npx wrangler secret put AI_KEK` (o l'equivalente per l'ambiente scelto);
2. avviare il Worker sull'host pubblico;
3. da Telegram: `/ai collega` → aprire il link entro 10 minuti → autorizzare su
   OpenRouter → verificare il messaggio di conferma in chat;
4. `/ai` deve riportare "Chiave: collegata e cifrata sul server";
5. `/ai proponi ricordami di chiamare il dentista domani alle 9` → verificare
   che il promemoria sia creato e che `ai_budget_entries` abbia una riga
   `settled` con `actual_micros > 0`;
6. `/ai scollega` → verificare che `ciphertext` sia vuoto e lo stato `revoked`;
7. **riverificare l'appendice A** del [piano di fase](../planning/phases/c-ai-byok.md):
   le API esterne cambiano, e il piano stesso lo prescrive.

Esito atteso e residui vanno annotati qui sotto, in coda al runbook, con data.

## Diagnosi senza segreti

Mai selezionare `code_verifier`, `ciphertext`, `wrapped_dek` o il testo dei
messaggi. Usare stati e conteggi:

```sql
SELECT status, COUNT(*) FROM ai_oauth_sessions
WHERE user_id = ? GROUP BY status;

SELECT status, kek_version, record_version FROM ai_credentials
WHERE user_id = ?;

SELECT local_date, status, COUNT(*), SUM(reserved_micros), SUM(actual_micros)
FROM ai_budget_entries WHERE user_id = ? GROUP BY local_date, status;
```

## Scenari

**Il link scade prima che l'utente lo apra.** TTL 10 minuti, allineato alla
scadenza del codice OpenRouter. L'utente rifà `/ai collega`: le sessioni scadute
vengono ripulite dal Cron.

**Il callback risponde sempre la stessa pagina.** È voluto: sessione
inesistente, scaduta o già usata devono essere indistinguibili. Per capire quale
sia stata, guardare `ai_oauth_sessions.status` e il log
`ai.oauth_session_rejected`, non la risposta HTTP.

**Lo scambio del codice fallisce.** L'adapter prova entrambe le forme
documentate (con e senza header `Authorization`). Se falliscono entrambe con 4xx
l'esito è `rejected`; con 5xx o timeout è `unavailable` e l'utente può riprovare.

**`ai.credential_unreadable` nei log.** Il ciphertext non si apre con l'anello
di KEK corrente: quasi sempre significa che `AI_KEK` è stato sostituito senza
spostare la vecchia in `AI_KEK_PREVIOUS`. Rimettere la chiave precedente con la
sua versione e lasciare che il re-wrap progressivo faccia il resto; se la chiave
è perduta, l'unica strada è `/ai scollega` e un nuovo collegamento.

**Budget esaurito.** Il rifiuto è esplicito e non degrada su un modello più
economico. Verificare `ai_budget_entries`: righe `reserved` senza consuntivo
oltre un'ora vengono rilasciate dal Cron
(`purgeExpiredAiProposals` → `releaseStale`).

**402 dal provider.** Credito esaurito o cap della chiave: errore permanente,
nessun retry. 429 è ritentabile e apre l'interruttore dopo tre fallimenti.

## Rotazione della KEK

1. generare la nuova chiave; impostare `AI_KEK` = nuova, `AI_KEK_VERSION` = N+1,
   `AI_KEK_PREVIOUS` = vecchia, `AI_KEK_PREVIOUS_VERSION` = N;
2. i record esistenti restano leggibili (decrypt su N-1) e il re-wrap li porta
   progressivamente alla versione corrente;
3. rimuovere la chiave precedente **solo** quando nessun record ha più
   `kek_version = N`:

```sql
SELECT kek_version, COUNT(*) FROM ai_credentials GROUP BY kek_version;
```

Mai fare downgrade: una versione sconosciuta produce un rifiuto esplicito, non
un fallback silenzioso.

## Rollback

Le migration C2 sono **additive**: un Worker N-1 gira sullo schema N senza
vederne le tabelle. Per disattivare la superficie AI senza toccare lo schema è
sufficiente rimuovere `AI_PROVIDER`: il prodotto torna in `NO_AI` e
`/ai collega` non viene più offerto. I ciphertext restano al loro posto e
tornano leggibili quando l'AI viene riattivata con la stessa KEK.

## Verifica

```powershell
npm run validate
```

I test che coprono questa slice: `tests/security/ai-oauth-security.test.ts`
(replay, scadenza, PKCE, concorrenza, allowlist, rate limit, revoca),
`tests/security/credential-crypto.test.ts` (cross-tenant, manomissione,
rotazione, nonce), `tests/unit/ai-openrouter-adapter.test.ts` (entrambe le forme
dello scambio, privacy strict, costo, interruttore) e
`tests/integration/ai-budget.test.ts` (prenotazione atomica e recovery).

## Esiti dello smoke live

| Data | Ambiente | Esito               | Residui                                        |
| ---- | -------- | ------------------- | ---------------------------------------------- |
| —    | —        | non ancora eseguito | attende l'host pubblico (gate G0.2, opzione b) |
