# Milestone corrente — C1 ActionProposal con provider mock

**Stato: attiva dal 2026-08-20.** Slice C0 chiusa e firmata; il perimetro
autorizzato è ora C1 come descritto in [phases/c-ai-byok.md](phases/c-ai-byok.md).
Il contratto congelato è in [ADR-0023](../decisions/0023-action-proposal-contract.md).

## Risultato atteso

Un testo libero passato a `/ai proponi` produce proposte strutturate che
attraversano schema strict → Zod → validator semantico → confirmation policy →
dominio, con **provider mock**: nessuna rete, nessuna credenziale, nessun costo.
Un output non valido non scrive mai nulla.

## Gate di chiusura

- test di conformità dello schema strict verde;
- property test: nessun input produce `execute_with_undo` per una classe
  distruttiva o per cardinalità > 1;
- idempotenza sotto retry: stesso `jobId` due volte, una sola chiamata al
  provider e una sola scrittura;
- cross-tenant, prompt injection, output invalido e conferma altrui coperti da
  test security;
- `NO_AI` verde: il Worker parte senza alcuna variabile AI;
- migration provata fresh e upgrade, con `provenance` a `entered` sul dato
  preesistente e ledger `effects` integro;
- baseline del benchmark registrata;
- `npm run validate` verde.

## Out of scope

- OAuth OpenRouter, credenziali utente, cifratura, budget monetario reale (C2);
- estensione dell'enum a lavoro, finanze e liste (C1.2);
- testo libero senza comando esplicito, inoltri e link (C3);
- creazione di risorse Cloudflare remote e deploy.

## Prossima decisione

C2 si attiva solo con un ulteriore aggiornamento esplicito di questo file, dopo
la firma del gate C1.
