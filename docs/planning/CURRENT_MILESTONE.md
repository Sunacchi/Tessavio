# Milestone corrente — C2 OAuth, cifratura, budget e privacy

**Stato: attiva dal 2026-08-20.** Slice C1 chiusa e firmata; il perimetro
autorizzato è ora C2 come descritto in [phases/c-ai-byok.md](phases/c-ai-byok.md).
I contratti congelati sono in [ADR-0024](../decisions/0024-oauth-and-credential-crypto.md)
(OAuth e crypto) e [ADR-0025](../decisions/0025-ai-budget-privacy-model-policy.md)
(budget, privacy, model policy).

## Risultato atteso

L'utente collega la propria chiave OpenRouter con un flusso OAuth PKCE che non
fa mai passare la chiave da Telegram; la credenziale è cifrata con envelope
encryption legata al tenant; ogni chiamata passa da tre controlli distinti
(budget applicativo prenotato, hard limit del provider, costo massimo per
operazione) e da una configurazione di privacy strict.

## Gate di chiusura

- test security su replay, sessione scaduta, PKCE errato, callback concorrente,
  host fuori allowlist, rate limit e revoca;
- test crypto su cross-tenant, manomissione, rotazione KEK e unicità del nonce;
- test a due job concorrenti sul budget: esattamente una chiamata al provider;
- prenotazione appesa rilasciata invece di bloccare il budget;
- migration additiva provata fresh e upgrade, con conservazione dei ciphertext;
- `npm run validate` verde.

## Fuori perimetro, per decisione firmata (G0.2)

Lo **smoke live** con OpenRouter reale non fa parte di questa slice: non esiste
un host pubblico e non è autorizzato alcun deploy. C2 chiude **verde in locale
con smoke live pendente**, e la procedura per eseguirlo quando l'host esisterà è
nel [runbook C2](../runbooks/C2_OAUTH_RECOVERY.md).

## Out of scope

- estensione dell'enum azioni a lavoro, finanze e liste (C1.2);
- testo libero senza comando esplicito, inoltri e link (C3);
- modalità free/best-effort, esclusa dalla Phase C;
- creazione di risorse Cloudflare remote e deploy.

## Prossima decisione

C1.2 si attiva solo con un ulteriore aggiornamento esplicito di questo file,
dopo la firma del gate C2.
