---
description: Compila la matrice Definition of Done per la modifica corrente prima di dichiararla completa. Usala quando la richiesta è "è finito?", "chiudi la slice", "verifica la DoD" o prima di un commit di feature.
---

# Gate Definition of Done

1. Leggi `docs/planning/DEFINITION_OF_DONE.md`.
2. Guarda il diff reale: `git diff HEAD --stat` e poi i file rilevanti.
3. Per ogni gate applicabile produci una riga:

| ID | Gate | Pass / Pending / N/A | Evidenza (file:simbolo, comando, esito) |

Regole:

- `N/A` richiede una motivazione in una frase. `N/A` senza motivazione = `Pending`.
- L'evidenza è un test eseguito o un file preciso, mai "implementato correttamente".
- Se un gate è `Pending`, la feature **non** è completa: elenca cosa manca.
- Non chiudere con finding P0/P1 aperti nello scope.

Termina con: numero di gate `Pass`, `Pending` e `N/A`, e la frase
"completa" oppure "non chiudibile: <motivo>".
