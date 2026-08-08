# ADR-0005 — User-owned AI credentials and privacy

- Status: accepted
- Date: 2026-08-08

## Context

Aggregare il consumo sul conto del proprietario rende i costi imprevedibili. Le richieste possono contenere dati personali o sensibili.

## Decision

La modalità produzione primaria è `OPENROUTER_USER` tramite OAuth PKCE S256 e API key controllata dall'utente. Le credenziali sono cifrate, non entrano in Telegram e non vengono loggate. Privacy `STRICT` è il default: contesto minimo, niente prompt logging, no-training e ZDR quando compatibile.

Budget applicativo, hard limit del provider e costo massimo per operazione sono controlli distinti.

## Consequences

La modalità free è best effort e opt-in quando riduce la privacy. I fallback rispettano capability, privacy e costo. Disconnessione revoca localmente la connessione e rimuove il segreto cifrato.
