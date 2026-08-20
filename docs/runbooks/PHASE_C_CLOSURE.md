# Phase C — Evidenza di chiusura

Riproduce il gate trasversale della Phase C. Non crea risorse Cloudflare
remote, non applica migration remote e non esegue deploy.

**Stato dichiarato: verde in locale, smoke live OAuth interattivo pendente.** È
la conseguenza accettata del gate G0.2 (opzione b): non è autorizzato alcun
deploy. La procedura può usare un Quick Tunnel effimero ed è nel
[runbook C2](C2_OAUTH_RECOVERY.md).

## Criteri di uscita e dove sono provati

| Criterio di uscita                                                   | Evidenza                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| nessuna risposta di un modello bypassa policy, permessi o dominio    | `tests/unit/ai-policy.test.ts` (property), `tests/security/ai-proposal-security.test.ts`              |
| `NO_AI` resta un percorso di prima classe e la demo B passa senza AI | `tests/integration/phase-b-demo.test.ts` (env senza variabili `AI_*`), `tests/unit/ai-config.test.ts` |
| output invalido produce recovery utile, mai una write best effort    | `tests/security/ai-proposal-security.test.ts` (JSON invalido, schema violato, slot estraneo)          |
| l'Inbox instrada senza duplicare entità o regole                     | `tests/integration/ai-inbox-flow.test.ts`, [ADR-0026](../decisions/0026-textual-inbox-boundaries.md)  |
| budget, privacy e costo massimo sono tre controlli distinti          | `tests/integration/ai-budget.test.ts`, `tests/unit/ai-openrouter-adapter.test.ts`                     |
| migration provate fresh e upgrade, ciphertext conservati             | `tests/integration/migration.test.ts` (0009, 0010, 0011)                                              |
| benchmark con baseline registrata                                    | `benchmark/baselines/c1-mock-v1.json`, `benchmark/baselines/c1-2-mock-v1.json`                        |
| `npm run validate` verde                                             | firma qui sotto                                                                                       |

## Matrice Definition of Done

| Gate                                        | C0  | C1  | C2  | C1.2 | C3  |
| ------------------------------------------- | --- | --- | --- | ---- | --- |
| input ambiguo gestito senza inventare dati  | N/A | sì  | sì  | sì   | sì  |
| fallback deterministico senza AI            | sì  | sì  | sì  | sì   | sì  |
| provenance inserito/estratto distinguibile  | N/A | sì  | N/A | sì   | sì  |
| timezone IANA, DST e date-only              | N/A | sì  | N/A | sì   | sì  |
| denaro in unità minori intere               | N/A | N/A | sì  | sì   | sì  |
| scope tenant esplicito su ogni accesso      | sì  | sì  | sì  | sì   | sì  |
| authorization prima della mutazione         | sì  | sì  | sì  | sì   | sì  |
| idempotency key e duplicate handling        | sì  | sì  | sì  | sì   | sì  |
| audit prima/dopo e correlation ID           | sì  | sì  | sì  | sì   | sì  |
| Undo per operazioni reversibili             | sì  | sì  | N/A | sì   | sì  |
| nessun segreto o prompt nei log             | sì  | sì  | sì  | sì   | sì  |
| retention e cancellazione definite          | N/A | sì  | sì  | sì   | sì  |
| output strict e validazione server-side     | N/A | sì  | sì  | sì   | sì  |
| context minimization                        | N/A | sì  | sì  | sì   | sì  |
| budget e costo massimo applicati            | N/A | N/A | sì  | sì   | sì  |
| prompt injection non amplia scope           | N/A | sì  | N/A | sì   | sì  |
| benchmark aggiornato con schema/prompt/enum | N/A | sì  | N/A | sì   | sì  |

`N/A` significa "non applicabile alla slice", non "non fatto": C0 non tocca
denaro né AI, C2 non crea entità di dominio.

## Riproduzione mirata

```powershell
npx vitest run tests/unit/ai-schema-conformance.test.ts tests/unit/ai-policy.test.ts
npx vitest run tests/unit/ai-proposal.test.ts tests/unit/ai-money-slot.test.ts
npx vitest run tests/security/ai-proposal-security.test.ts tests/security/ai-oauth-security.test.ts
npx vitest run tests/security/credential-crypto.test.ts
npx vitest run tests/integration/ai-proposal-flow.test.ts tests/integration/ai-budget.test.ts
npx vitest run tests/integration/ai-inbox-flow.test.ts tests/integration/migration.test.ts
npm run bench
```

Tutte le fixture sono sintetiche: nessuna credenziale reale, nessun dato
personale, nessuna rete.

## Firma locale

```powershell
npm run validate
```

Firma del 2026-08-20 dopo l'audit Codex: format, lint, type generation check,
typecheck, `drizzle-kit check`, 61 file Vitest e 294 test verdi, build Worker
dry-run verde. Nessun deploy, provisioning o mutazione remota fa parte del
gate.

## Review indipendente e difetti chiusi

Prima della firma la fase è stata riletta da un revisore che non l'aveva
scritta, con mandato esplicito su idempotenza, budget, crittografia e tempo.
Ha trovato quattro difetti reali; tutti sono corretti e coperti da un test di
regressione che fallisce senza la correzione.

| Difetto                                                             | Effetto se non corretto                                      | Regressione                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| prenotazione budget `duplicate` dopo un rilascio                    | un retry chiamava il modello senza contabilizzarne il costo  | `tests/integration/ai-budget.test.ts` (riapertura, accumulo)  |
| chiusura del job prima della consegna della risposta                | consegna fallita in modo ritentabile = utente senza risposta | `tests/integration/ai-proposal-flow.test.ts`                  |
| durata di default sommata in millisecondi                           | orario civile inesistente nel salto DST di primavera         | `tests/unit/ai-proposal.test.ts` (29 marzo 2026, Europe/Rome) |
| effetto lasciato in `claimed` da un'eccezione successiva alla claim | l'operazione restava bloccata per sempre, retry inclusi      | `tests/unit/ai-executor.test.ts`                              |

Il quarto ha richiesto un'aggiunta di porta (`EffectRepository.release()`): il
ledger degli effetti ora distingue "in corso" da "abbandonato".

Un audit successivo ha corretto altri tre difetti prima della consegna:

| Difetto                                                                  | Correzione / regressione                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `max_price` trattato come costo totale anziché USD per milione di token  | ceiling di prezzo versionati + `max_tokens` derivato dal tetto totale; test adapter e integrazione budget |
| allowlist con un modello non più pubblicato e non applicata dall'adapter | allowlist riverificata via API OpenRouter e rifiuto pre-rete dei modelli non ammessi                      |
| validator AI nuovo a 801 righe e orchestratore oltre budget              | split per tipi, azioni estese e delivery; tutti i file toccati sotto 500 righe                            |

## Limiti dichiarati alla chiusura

- **Smoke live OAuth non eseguito**: richiede login OpenRouter e credenziale
  reali del proprietario (gate G0.2). Non serve più un deploy: il runbook usa
  un Quick Tunnel Wrangler. Finché non viene eseguito, l'adapter è provato solo
  contro un server fake e il contratto documentato dell'API.
- **La baseline del benchmark misura l'harness**, non la qualità di un modello:
  il provider è mock e il confronto significativo arriva col primo provider
  reale sullo stesso dataset.
- **Canary di promozione**: la regola è scritta (benchmark prima di ogni cambio
  di modello, prompt o schema) ma non è ancora stata esercitata, perché non
  esiste un modello reale da promuovere.
- **Modalità free/best-effort esclusa** dalla Phase C per decisione G0.2.
- **`source` e `provenance`** convivono come due nomi dello stesso concetto
  nelle slice B5/B6 e nelle slice più recenti: l'unificazione è rimandata a
  quando quelle slice verranno toccate per altri motivi.

Decisioni: [ADR-0023](../decisions/0023-action-proposal-contract.md),
[ADR-0024](../decisions/0024-oauth-and-credential-crypto.md),
[ADR-0025](../decisions/0025-ai-budget-privacy-model-policy.md),
[ADR-0026](../decisions/0026-textual-inbox-boundaries.md).
