# Provisioning D1 e Queue per A1

Questo runbook documenta i comandi; non autorizza la creazione di risorse remote.
Usare bot, database, Queue e segreti distinti per dev, staging e production.

## Locale

```powershell
Copy-Item .dev.vars.example .dev.vars
npm ci
npm run cf-typegen
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state
npm run dev
```

Inserire in `.dev.vars` soltanto credenziali del bot di sviluppo. D1 e Queue
locali restano sotto `.wrangler/state`, ignorato da Git.

## Risorse remote EU

Ripetere per `tessavio-dev`, `tessavio-staging` e `tessavio-production` soltanto
dopo autorizzazione:

```powershell
npx wrangler d1 create tessavio-staging --jurisdiction eu
npx wrangler queues create tessavio-inbound-staging
npx wrangler queues create tessavio-inbound-dlq-staging
npx wrangler queues update tessavio-inbound-dlq-staging --message-retention-period-secs 86400
```

Sostituire il sentinel `database_id` nell'ambiente corretto di `wrangler.jsonc`,
rigenerare i tipi e applicare la migration:

```powershell
npm run cf-typegen
npx wrangler d1 migrations apply DB --env staging --remote
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --env staging
npx wrangler secret put TELEGRAM_BOT_TOKEN --env staging
```

Verificare dal risultato di `wrangler d1 create` che la giurisdizione sia `eu`.
Non riutilizzare ID, Queue o segreti tra ambienti. Il deploy production è fuori
scope A1.

La giurisdizione conferma solo D1: non regionalizza Worker, Queue, Cron,
Telegram, subrequest o provider AI. Prima di creare staging applicare i gate di
[residenza/subprocessori](../privacy/PROCESSOR_AND_RESIDENCY_MATRIX.md) e
[operatività](PRE_PILOT_OPERATIONS.md), inclusi retention/alert DLQ. I comandi
documentati non vanno eseguiti senza autorizzazione separata.

## Forward validation e recovery migration

La migration iniziale è additive da database vuoto. Validarla localmente con:

```powershell
Remove-Item -Recurse -Force -LiteralPath .wrangler/state
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state
npm run test:integration
```

La rimozione riguarda esclusivamente lo stato D1/Queue locale ricreabile. Per
remote non eseguire rollback SQL manuali: fermare il deploy, conservare il backup
D1 e applicare una nuova migration forward correttiva.
