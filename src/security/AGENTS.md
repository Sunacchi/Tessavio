# src/security — regole

Authorization, cifratura, privacy e rate limiting sono confini applicativi
**obbligatori**, non utility opzionali.

- Ogni write condivisa verifica membership, ruolo e scope della risorsa.
- Web Crypto usato correttamente: i nonce AES-GCM sono unici per chiave. Per le
  credenziali utente preferisci envelope encryption con versione della chiave.
- State e sessione OAuth: opachi, casuali, monouso, legati all'utente e di breve
  durata. PKCE con S256.
- Non loggare né restituire materiale segreto. Un hash non sostituisce la
  cifratura per una credenziale riutilizzabile.
- Ogni modifica richiede test negativi su bypass, replay, riuso e leakage.
