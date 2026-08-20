---
description: Crea un nuovo Architecture Decision Record numerato e aggiorna l'indice. Usala quando una decisione durevole viene presa o cambiata (contratto di slice, confine, dipendenza, policy).
argument-hint: [titolo breve]
---

# Nuovo ADR

1. Trova il numero successivo: `ls docs/decisions/ | sort | tail -3`.
2. Crea `docs/decisions/<NNNN>-<slug-kebab>.md` con questa struttura esatta:

```md
# ADR-<NNNN> — <Titolo>

Stato: accepted
Data: <YYYY-MM-DD>

## Contesto

Il problema e i vincoli reali. Niente storia del progetto.

## Decisione

Cosa si fa, in punti verificabili. Include i numeri concreti (TTL, limiti,
retention, chiavi) perché è qui che si va a cercarli.

## Conseguenze

Cosa diventa vero, cosa resta escluso, cosa costa.

## Condizioni di riesame

L'evento misurabile che riapre questa decisione.
```

3. Aggiungi la voce in fondo alla lista di `docs/decisions/README.md`.
4. Non riscrivere un ADR superato: creane uno nuovo, metti il vecchio a
   `superseded` e collega entrambi.

Titolo richiesto: **$1**.
