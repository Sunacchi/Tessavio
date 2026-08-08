# ADR-0009 — Open Banking escluso dal prodotto

- Status: accepted
- Date: 2026-08-08

## Context

Le funzioni finanziarie di Tessavio registrano dati inseriti dall'utente e
producono riepiloghi o stime. Predisporre collegamenti bancari “per il futuro”
aggiungerebbe credenziali ad alto rischio, dipendenze regolamentari, provider e
schema inutilizzati, confondendo il registro personale con un servizio di
pagamento.

## Decision

Open Banking è escluso definitivamente: nessun collegamento o sincronizzazione
di conti, credenziale bancaria, provider PSD2/AISP/PISP, disposizione di
pagamenti, adapter, dipendenza o tabella bancaria.

Tessavio accetta inserimento conversazionale e import CSV avviato manualmente
dall'utente, con preview, dedupe, authorization e rollback. L'import manuale non
è Open Banking e non abilita polling o accesso continuativo a una banca.

## Consequences

- i domini finanza, split, debiti e prestiti registrano fatti; non muovono denaro;
- segreti e threat model non includono credenziali bancarie;
- roadmap e schema non contengono seam speculative per banche;
- una richiesta futura di Open Banking richiederebbe una nuova decisione di
  prodotto che supersede esplicitamente questo ADR, oltre a review legale e
  security dedicata.

## Revisit when

Solo se il proprietario cambia esplicitamente la missione del prodotto. Crescita
utenti, disponibilità di provider o richieste isolate non bastano.
