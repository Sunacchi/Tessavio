---
description: Esegue il protocollo di chiusura di una fase e propone la successiva. Usala solo quando tutti gli outcome della milestone attiva sono verdi.
argument-hint: [fase]
disable-model-invocation: true
---

# Chiusura fase $1

Prerequisiti da verificare **prima** di scrivere qualsiasi cosa:

- tutti gli outcome della milestone in `CURRENT_MILESTONE.md` sono completati;
- `npm run validate` è verde (esegui e mostra l'output);
- zero finding P0/P1 aperti;
- ADR, runbook e `REQUIREMENTS_COVERAGE.md` aggiornati.

Se anche uno manca: **non chiudere**, elenca cosa manca e fermati.

Consegna esattamente in questo formato:

```md
## Chiusura <fase>

- Esito: completata | non chiudibile
- Evidenze: test, migration, review, recovery e documenti
- Rischi residui: finding con owner oppure nessuno

## Prossimo passo

- Fase successiva: <ID e titolo>
- Modello primario consigliato: <vedi docs/agents/MODEL_ROUTING.md>
- Modelli/agenti di supporto: <ruoli bounded>
- Perché: <rischio e tipo di lavoro in 1-3 frasi>
- Prima task: <obiettivo pronto da assegnare>
- Gate prima di partire: <decisioni o prerequisiti>
```

Aggiorna `CURRENT_MILESTONE.md` **solo dopo** la firma del gate. Annunciare la
fase successiva non la rende attiva.
