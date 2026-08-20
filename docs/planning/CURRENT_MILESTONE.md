# Milestone corrente — C1.2 estensione dell'enum azioni

**Stato: attiva dal 2026-08-20.** Slice C2 chiusa (verde in locale, smoke live
pendente per il gate G0.2). Il perimetro autorizzato è ora C1.2 come descritto
in [phases/c-ai-byok.md](phases/c-ai-byok.md); il contratto esteso è
nell'aggiornamento C1.2 di
[ADR-0023](../decisions/0023-action-proposal-contract.md).

## Risultato atteso

L'enum passa da sette a undici azioni (finanze, liste e lavoro) riusando
validator, policy e harness senza modificarli. Il denaro entra dal testo grezzo
e viene risolto in unità minori intere dal codice deterministico.

## Gate di chiusura

- nessuna regressione del tasso di azioni false sul dataset C1 con l'enum
  esteso, verificata dal benchmark;
- baseline C1.2 registrata su un dataset dedicato;
- provenance estesa a finanze, liste e turni: un'entità creata da una proposta è
  distinguibile da una inserita a mano;
- migration additiva provata fresh e upgrade;
- `npm run validate` verde.

## Out of scope

- testo libero senza comando esplicito, inoltri e link (C3);
- variante (B) dello schema per azione: il benchmark non mostra errori di slot
  che la giustifichino;
- creazione di risorse Cloudflare remote e deploy.

## Prossima decisione

C3 si attiva solo con un ulteriore aggiornamento esplicito di questo file, dopo
la firma del gate C1.2.
