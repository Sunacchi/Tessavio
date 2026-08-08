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

## Credenziali BYOK

Le API key utente non entrano mai nella chat Telegram. Per produzione usare envelope encryption: DEK casuale per record, AES-GCM, DEK cifrata con KEK in Cloudflare Secret, nonce unico e versione credenziale. Il flusso OAuth usa PKCE S256 e sessioni opache, one-time e con scadenza breve.

## Segnalazione vulnerabilità

Finché non esiste un canale pubblico, non aprire issue con dettagli sensibili. Documentare privatamente riproduzione, impatto, tenant coinvolti, log redatti e piano di mitigazione.
