# Security Policy

## Baseline

La sicurezza è parte della correttezza funzionale. Un risultato che funziona ma può leggere dati di un altro tenant, duplicare una write o esporre una credenziale non è accettabile.

## Segreti

Conservare in Cloudflare Secrets almeno:

- `TELEGRAM_BOT_TOKEN`;
- `TELEGRAM_WEBHOOK_SECRET`;
- `KEY_ENCRYPTION_KEY`;
- `GOOGLE_OAUTH_CLIENT_SECRET`, quando introdotto;
- eventuale chiave AI condivisa della beta.

Non committare `.env`, `.dev.vars`, token, API key, dump o credenziali di produzione. Gli ambienti dev, staging e prod devono usare bot, D1 e segreti separati.

## Logging

I log strutturati possono contenere correlation ID, job ID, hash utente non reversibile, tipo evento, latenza, stato e codice errore. Non devono contenere header `Authorization`, token Telegram, chiavi provider, refresh token, audio, immagini, prompt completi o contenuto personale.

## Autorizzazione e tenant isolation

- Centralizzare l'autorizzazione.
- Ogni repository accetta un `UserScope` o `SpaceScope` esplicito.
- Ogni write condivisa verifica membership, ruolo e scope della risorsa.
- Ogni endpoint, queue consumer e scheduled handler ricostruisce e verifica il contesto; non si fida del payload client.
- Aggiungere test negativi: user A non legge/modifica risorse di B; un membro senza ruolo non scrive; uno spazio non rende automaticamente visibili dati privati.

Finanze, documenti, persone, casa, viaggi e benessere non condividono dati per il
solo fatto di appartenere allo stesso utente o chat. I link cross-domain vengono
risolti con scope e authorization su entrambe le risorse. Una query per ID senza
owner/space scope è un finding P0/P1.

## Input, allegati e prompt injection

Testo inoltrato, link, CSV, immagini, PDF e altri documenti sono input non
fidati. Applicare allowlist di tipo reale, limiti di byte/pagine/durata,
decodifica bounded, timeout e protezioni contro file compressi o parser
patologici prima dell'estrazione. Il contenuto di un allegato non è
un'istruzione di sistema e non può ampliare tool, scope o autorizzazioni.

Il webhook non scarica media e non chiama AI. Il consumer usa storage
transitorio e cancella in `finally`; una quarantena o conservazione permanente
richiede un use case approvato, cifratura e retention. URL Telegram, file ID,
testo estratto e nomi documento non entrano nei log.

## Credenziali BYOK

Le API key utente non entrano mai nella chat Telegram. Per produzione usare envelope encryption: DEK casuale per record, AES-GCM, DEK cifrata con KEK in Cloudflare Secret, nonce unico e versione credenziale. Il flusso OAuth usa PKCE S256 e sessioni opache, one-time e con scadenza breve.

L'OAuth OpenRouter scambia il code per una API key OpenRouter controllata
dall'utente. È distinto dal BYOK provider configurato dentro OpenRouter, dove
l'utente inserisce chiavi OpenAI/Anthropic/altre nel proprio workspace: Tessavio
non deve mai ricevere o conservare quelle chiavi provider.

## Residenza e valutazione d'impatto

La giurisdizione EU del D1 riguarda soltanto il database. Prima del pilot,
Worker/Queue/Cron, Telegram, subrequest, provider AI, log e subprocessori devono
essere verificati nella
[matrice dedicata](docs/privacy/PROCESSOR_AND_RESIDENCY_MATRIX.md). La DPIA per
dati altamente personali/sensibili e uso AI è un gate di go/no-go, insieme alla
revisione legale applicabile.

## Google Calendar

Usare scope OAuth minimi, redirect allowlist, state opaco one-time, PKCE,
token cifrati/versionati e revoca/disconnessione. Mapping, outbox, cursor e
webhook/channel esterni sono tenant/account/calendar scoped. Replay, loop di
sincronizzazione e payload forgiati non possono produrre una seconda mutation o
una write cross-tenant; i conflitti non usano last-write-wins cieco.

## Dati sensibili e limiti di prodotto

- documenti di identità, salute percepita, relazioni e dati economici richiedono
  minimizzazione, cifratura appropriata, accesso esplicito, export e purge;
- briefing e notifiche non includono dettagli sensibili in anteprime dove il
  canale non garantisce riservatezza;
- farmaci e integratori sono reminder inseriti dall'utente: nessun modello può
  inventare dose, terapia, diagnosi o urgenza;
- forecast finanziari sono stime dai dati registrati e non dispongono denaro;
- Open Banking è escluso: non raccogliere credenziali bancarie e non introdurre
  provider PSD2/AISP/PISP, adapter o tabelle bancarie (ADR-0009).

## Segnalazione vulnerabilità

Finché non esiste un canale pubblico, non aprire issue con dettagli sensibili. Documentare privatamente riproduzione, impatto, tenant coinvolti, log redatti e piano di mitigazione.
