# ADR-0010 — Tessavio Inbox e confini dei domini personali

- Status: accepted
- Date: 2026-08-08

## Context

Un messaggio, una bolletta o una prenotazione può contenere più intenti. Un
modello “Inbox” che copiasse eventi, spese, documenti e persone diventerebbe una
seconda fonte della verità; lasciare invece ogni adapter interpretare e scrivere
direttamente moltiplicherebbe authorization, retry e rischi AI.

## Decision

La Tessavio Inbox è un confine di acquisizione applicativo. Normalizza input e
provenienza minima, deduplica, classifica e produce comandi deterministici o
`ActionProposal[]` versionate. Non possiede copie delle entità di dominio.

Il percorso delle mutazioni è sempre:

```text
input -> normalizzazione -> proposta/comando -> schema -> validator -> policy
      -> domain service -> persistenza + audit/Undo -> risposta
```

Finanze, documenti, persone, viaggi, eventi, task, liste e spazi mantengono
invarianti e repository propri. I collegamenti cross-domain sono riferimenti
tipizzati, tenant-scoped e autorizzati; non autorizzano query polimorfe per ID né
una tabella universale creata in anticipo. I documenti conservano provenance dei
campi estratti, non diventano la fonte autorevole di una spesa o di un evento.

Un input ambiguo produce una domanda mirata. Solo una policy deterministica può
eseguire azioni non ambigue, reversibili e low-risk con Undo; azioni sensibili,
condivise, bulk o distruttive richiedono preview.

## Consequences

- testo, voce, vision e documenti riusano la stessa pipeline;
- ogni nuova action type arriva insieme alla vertical slice del dominio;
- un fallimento parziale tra più proposte usa idempotency key distinte e mostra
  l'esito, senza simulare atomicità cross-domain non garantita;
- ricerca, briefing e link attraversano porte applicative autorizzate, non
  accedono liberamente alle tabelle altrui.

## Revisit when

Un use case misurato richiede una transazione cross-domain indivisibile o la
ricerca mostra limiti che non possono essere risolti con viste/indici bounded.
