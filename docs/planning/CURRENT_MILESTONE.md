# Milestone corrente — C0 Registry di dominio

**Stato: attiva dal 2026-08-19.** Unico perimetro autorizzato: il refactor
strutturale C0.1-C0.3 descritto in [phases/c-ai-byok.md](phases/c-ai-byok.md).
Il gate G0 è firmato: le decisioni sono registrate nella sezione G0 del piano e
nel [decision register](MASTER_ACTION_PLAN.md).

## Risultato atteso

Il dispatch dei comandi passa da un registry: `process-inbound.ts` non importa
porte di dominio, i contenitori di use case non hanno dipendenze opzionali, i
parser vivono per dominio e `ports.ts` è un re-export. Nessun comportamento
utente cambia.

## Gate di chiusura

- nessuna assertion di un test esistente modificata;
- zero `?:` nei contenitori di use case;
- `deterministic-command.ts` e `ports.ts` sotto i budget di ADR-0022;
- `npm run validate` verde.

## Out of scope

- qualsiasi file, tabella, configurazione o dipendenza AI;
- OAuth, credenziali, provider, modelli, prompt, `ActionProposal`;
- refactor di `schema.ts` e `list-repository.ts`;
- creazione di risorse Cloudflare remote e deploy.

## Prossima decisione

C1 si attiva solo con un ulteriore aggiornamento esplicito di questo file, dopo
la firma del gate C0.
