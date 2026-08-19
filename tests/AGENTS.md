# tests — regole

I test provano comportamento e invarianti, non dettagli di implementazione.

| Livello        | Cosa deve coprire                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/`        | date/ora, ricorrenze, calcoli lavoro, denaro, permessi, budget, validator                                                                         |
| `integration/` | migration reali D1, repository scoped, webhook/Queue/Cron, outbox, adapter fake, recovery delle crash window                                      |
| `security/`    | negazione cross-user e cross-space, ruolo negato, callback forgiata o riusata, update duplicato, documento ostile, prompt injection, scan dei log |
| property       | intervalli temporali e DST, ricorrenze, denaro, overlap del planner                                                                               |

- Fake clock, ID deterministici e fixture sanificate. **Mai** token di
  produzione o dati personali reali.
- Ogni bug fix parte da un regression test che fallisce, quando praticabile.
- Un test di idempotenza esegue il flusso **due volte** e verifica che lo stato
  finale e gli effetti esterni non cambino.
- Un test cross-tenant verifica anche che il tenant concorrente resti immutato,
  non solo che la lettura fallisca.
- Open Banking: nessun adapter finto. Uno scan deve impedirne l'introduzione.

Helper condivisi in `helpers.ts`; non duplicare la costruzione del runtime.
