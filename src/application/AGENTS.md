# src/application — regole

Orchestrazione degli use case. Nessuna presentazione Telegram, nessun nome di
modello AI, nessun dettaglio D1.

Ordine obbligatorio in ogni use case:

```
identità → authorization → idempotenza → validazione/policy → dominio
        → persistenza → audit/Undo → notifica
```

- Le modifiche derivate dall'AI entrano **solo** come `ActionProposal[]` e si
  validano su: schema, scope, permessi, date, duplicati, conflitti, range,
  budget e stato distruttivo/bulk.
- Preview obbligatoria per azioni ambigue, distruttive, bulk o condivise. Le
  azioni semplici, non ambigue e non distruttive possono eseguire con Undo.
- Un retry del provider non deve rieseguire una write di dominio.
- **Porte per slice:** una slice nuova definisce le sue porte in
  `ports/<slice>.ts`. Non allargare un barrel condiviso (vedi ADR-0022).
- **Parser per dominio:** un comando nuovo aggiunge `commands/<dominio>.ts` e si
  registra. Non allungare uno switch centrale.
- Una dipendenza opzionale (`foo?:`) in un contenitore di use case è un registry
  mancante: segnalalo invece di aggiungerne un'altra.

Esempio canonico: `manage-events.ts`.
