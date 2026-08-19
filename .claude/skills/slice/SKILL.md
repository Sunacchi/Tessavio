---
description: Implementa una vertical slice di Tessavio end-to-end, dal contratto al commit. Usala quando la richiesta è "implementa <slice>", "aggiungi il dominio X", "nuova feature", o quando parte una nuova milestone.
argument-hint: [id-slice]
---

# Vertical slice

Slice richiesta: **$1** (se vuota, chiedi quale).

## 1. Perimetro

Leggi `docs/planning/CURRENT_MILESTONE.md`. Se la slice **non** è nella milestone
attiva, fermati e chiedi conferma esplicita: attivare una fase è una decisione
del proprietario, non tua. Poi apri il solo file di fase corrispondente in
`docs/planning/phases/`.

## 2. Contratto (prima del codice)

Fissa e scrivi, in una frase ciascuno:

- entità, campi e semantica temporale (`date_only` vs `instant` vs nessuna scadenza);
- `UserScope`/`SpaceScope` e capability richiesta;
- idempotency key e semantica di retry;
- cosa è auditabile e cosa è annullabile, con TTL dell'Undo;
- comandi Telegram e testo di risposta nei casi ok / ambiguo / negato / errore.

Se una di queste è ambigua, è una decisione del main agent: chiedila, non
inventarla.

## 3. Ordine di implementazione

1. **Migration** in `migrations/` — additiva, con owner/space scope e indici. Vedi `migrations/AGENTS.md`.
2. **Dominio** in `src/domains/<dominio>/` — puro, deterministico, senza I/O.
3. **Porte** in `src/application/ports/<slice>.ts` — non allargare un barrel esistente.
4. **Repository** in `src/infrastructure/db/` — ogni metodo riceve lo scope esplicito.
5. **Use case** in `src/application/manage-<slice>.ts` — ordine obbligatorio:
   identità → authorization → idempotenza → validazione/policy → dominio →
   persistenza → audit/Undo → notifica.
6. **Parser comando** in `src/application/commands/<dominio>.ts` e registrazione.
7. **Risposta Telegram** come adapter di presentazione.

## 4. Test (nello stesso commit)

- `tests/unit/<slice>.test.ts`: regole pure, validator, calcoli;
- `tests/integration/<slice>-flow.test.ts`: migration reale, repository scoped, flusso end-to-end, idempotenza al secondo passaggio;
- `tests/security/<slice>-security.test.ts`: lettura e scrittura cross-user negate;
- property test se la slice tocca tempo, ricorrenze, denaro o planner.

Usa fake clock e ID deterministici. Vedi `tests/AGENTS.md`.

## 5. Chiusura

- ADR in `docs/decisions/` per il contratto congelato (usa `/adr`);
- runbook di recovery in `docs/runbooks/`;
- aggiorna `docs/planning/REQUIREMENTS_COVERAGE.md` e `CURRENT_MILESTONE.md`;
- `EXPLAIN QUERY PLAN` sulle query hot introdotte;
- `npm run validate` e mostra l'output;
- compila la matrice con `/dod` prima di dichiarare fatto.
