# Phase C — AI Layer opzionale e BYOK

> Stato: **non attiva**. Prossima milestone di prodotto: non implementare senza aggiornare [CURRENT_MILESTONE](../CURRENT_MILESTONE.md).

## Risultato utente

L'utente può collegare OpenRouter fuori dalla chat e scrivere richieste naturali.
Il modello restituisce proposte, mentre validazione, permessi, policy, preview,
write, audit e Undo rimangono software deterministico.

- [ ] attivare C e definire dataset/metriche baseline prima di scegliere modelli;
- [ ] definire union strict e versionata di `ActionProposal[]` per sole azioni B;
- [ ] generare JSON Schema e riconvalidare con Zod lato server;
- [ ] implementare validator semantico per scope, permessi, date, range,
      duplicati, conflitti, assunzioni e operazioni bulk/distruttive;
- [ ] implementare confirmation policy deterministica: execute+Undo vs preview;
- [ ] rendere idempotente proposal execution anche con retry provider/Queue;
- [ ] definire adapter provider-agnostic e capability T0/T1/T2/T3/T-STT;
- [ ] implementare modalità `NO_AI` come percorso di prima classe;
- [ ] implementare OAuth OpenRouter PKCE S256 con sessione opaca, one-time,
      user-bound e a scadenza breve; la key risultante è una credenziale
      OpenRouter user-controlled, non una chiave provider BYOK; nessuna API key
      nella chat;
- [ ] cifrare credenziali con envelope encryption, nonce unico e versionamento;
- [ ] implementare uso/budget, hard limit provider e max cost per operation separati;
- [ ] configurare model policy/fallback per capability, privacy, costo e disponibilità;
- [ ] minimizzare il contesto e impedire prompt/credential logging;
- [ ] aggiungere circuit breaker e fallback solo privacy-equivalente e sotto cap;
- [ ] creare benchmark sintetico italiano: multi-intent, date ambigue, turni,
      false-action rate, schema validity, latency e cost;
- [ ] aggiungere test schema, prompt injection, replay OAuth, budget race,
      provider timeout, output invalido e AI-unavailable;
- [ ] testare consumo OAuth concorrente single-use, wrong user/provider/redirect,
      PKCE mismatch, ciphertext swap cross-tenant/tamper/versione e nonce reuse;
- [ ] validare ogni migration C con worker N-1/schema N, recovery e preservazione
      dei ciphertext/version metadata;
- [ ] eseguire canary controllato prima di promuovere modello/prompt/schema;
- [ ] chiudere C dimostrando che nessuna risposta AI può bypassare policy o dominio.
- [ ] introdurre C3 Tessavio Inbox testuale per messaggi, forward e link con
      provenance minima, routing multi-intent e idempotency key per proposta;
- [ ] verificare che l'Inbox non duplichi entità o regole dei domini;
- [ ] porre una domanda breve su campi essenziali ambigui ed eseguire con Undo
      solo azioni non ambigue, reversibili e low-risk.

UX obbligatoria: `/ai` mostra stato e modalità; il collegamento apre un flusso web;
ogni proposta mostra ciò che verrà modificato; output invalido produce recovery
utile o comando esplicito, mai una write “best effort”.

Agent route: main agent congela schema/policy; `ai_integrations_worker` implementa
adapter/OAuth/benchmark; `domain_worker` possiede validator/executor deterministico;
`data_security_reviewer` e `quality_reviewer` chiudono i gate.
