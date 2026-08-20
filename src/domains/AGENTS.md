# src/domains — regole

Codice puro e deterministico. Un dominio per directory, con la sua persistenza
dietro una porta.

- Non importare Cloudflare, grammY, Hono, Drizzle o SDK di provider. Se ti serve
  un import del genere, la logica sta nel layer sbagliato.
- Nessun I/O, nessun `Date.now()`, nessun `crypto.randomUUID()` diretto: clock e
  ID arrivano come parametri.
- Denaro: unità minori intere (`bigint` o `number` intero) e valuta esplicita.
  Mai `float`, mai conversioni di valuta.
- Tempo: conserva insieme data locale, timezone IANA e istante UTC. Una timezone
  non è mai un offset fisso. Usa Temporal, non aritmetica manuale sui giorni.
- Separa il lavoro **pianificato** (turno) dal **consuntivo** (log). Le regole di
  paga sono dati versionati, non costanti universali.
- Un dominio non legge le tabelle di un altro: i collegamenti cross-domain sono
  riferimenti tipizzati e tenant-scoped introdotti dalla slice che li usa.
- Ogni contratto di mutation include attore/scope, idempotency key e metadata di
  audit; le modifiche reversibili producono dati di Undo.

Esempio canonico: `events/events.ts` (tempo), `finance/finance.ts` (denaro).
