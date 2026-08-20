# ADR-0024 — OAuth PKCE e cifratura delle credenziali BYOK (C2)

Stato: accepted
Data: 2026-08-20

## Contesto

La Phase C rende l'AI opzionale e **BYOK**: la chiave del provider è
dell'utente ([ADR-0005](0005-byok-and-ai-privacy.md)). Serve quindi collegarla
senza mai farla transitare da Telegram e conservarla senza che una copia del
database la riveli.

Vincolo esterno verificato: **OpenRouter non documenta un parametro `state`**
nel flusso PKCE. Il binding CSRF deve quindi viaggiare nel `callback_url`, e da
lì discende tutto il resto del disegno.

Vincolo di ambiente (gate G0.2, firmato il 2026-08-19): non esiste alcuna
risorsa Cloudflare remota e non è autorizzato alcun deploy. C2 si chiude in
locale con un **server OAuth fake** nei test; lo smoke live resta un passo
esplicito del proprietario descritto nel
[runbook C2](../runbooks/C2_OAUTH_RECOVERY.md).

## Decisione

**Sessione opaca come binding.** `/ai collega` crea una riga
`ai_oauth_sessions` con un ID opaco, l'utente, la chat, il `code_verifier` e il
`code_challenge`. Il link inviato in chat è
`https://<host>/ai/oauth/start/<sessione>`; il `callback_url` passato al
provider è `https://<host>/ai/oauth/callback/<sessione>`. La sessione è
**user-bound**, **single-use** e ha **TTL 10 minuti**, allineato alla scadenza
del codice OpenRouter.

- il `code_verifier` resta server-side: non entra nell'URL né in un messaggio;
- il consumo è **atomico** (`UPDATE … WHERE status='pending' AND expires_at > ?
RETURNING …`): due callback concorrenti non producono due chiavi;
- il callback accetta **solo l'host configurato** (`AI_PUBLIC_BASE_URL`);
- la nuova superficie pubblica riusa il rate limiter D1 dell'ingress;
- **le risposte di errore sono indistinguibili**: sessione inesistente, scaduta
  o già usata producono stesso stato e stesso corpo. Il callback non è un
  oracolo.

**Envelope encryption della credenziale.** `src/security/credential-crypto.ts`:

- DEK AES-GCM 256 casuale **per credenziale**, nonce di 12 byte da
  `crypto.getRandomValues`, mai riusato;
- DEK avvolta in **AES-KW** con la KEK letta da un secret del Worker;
- **AAD = `versione | userId | scopo | versioneKEK`**: è ciò che rende
  impossibile spostare un ciphertext da un tenant all'altro;
- record versionato `{ v, kekVersion, nonce, wrappedDek, ciphertext }`;
- rotazione: `kekVersion` esplicita, decrypt su N-1, re-wrap progressivo verso
  la corrente, **mai** downgrade;
- una versione sconosciuta è un **rifiuto esplicito**, non un fallimento
  silenzioso.

**La KEK è un secret opzionale.** Non sta in `wrangler.jsonc` fra i
`secrets.required`: `NO_AI` è un percorso di prima classe e il Worker deve
partire senza KEK. Senza KEK il collegamento BYOK non viene offerto, invece di
fallire a metà.

**Revoca.** `/ai scollega` **cancella il ciphertext** (non lo marca soltanto),
azzera nonce e DEK avvolta e disattiva le proposte. La chiave sul provider resta
dell'utente: revocarla lì è una sua azione, e il runbook lo dice.

**Il `code_verifier` è in chiaro nella riga di sessione.** È un segreto
effimero, single-use, con TTL di dieci minuti e senza valore dopo lo scambio:
cifrarlo aggiungerebbe una dipendenza dalla KEK proprio nel percorso che serve a
ottenerla. La credenziale durevole, quella sì, è sempre cifrata.

## Conseguenze

- Il flusso è provabile per intero senza rete: il server fake verifica il PKCE
  come farebbe il provider e i test coprono replay, scadenza, PKCE errato,
  callback concorrente, host fuori allowlist e rate limit.
- L'adapter tollera **entrambe le forme** documentate dello scambio (con e
  senza header `Authorization`): la doc è ambigua e la verifica definitiva è lo
  smoke live.
- La Phase C chiude come _verde in locale con smoke live pendente_: è una
  conseguenza accettata del gate G0.2, non un difetto.
- Ruotare la KEK richiede un ciclo di re-wrap: fino al completamento convivono
  due versioni, ed è per questo che il record le porta esplicitamente.

## Condizioni di riesame

Riesaminare se OpenRouter documenta un parametro `state` (il binding potrebbe
tornare standard), se il flusso PKCE cambia, o quando esiste un host pubblico
stabile e lo smoke live viene eseguito.
