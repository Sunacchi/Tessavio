# src/entrypoints — regole

Traducono eventi Cloudflare e delegano. **Nessuna logica di business.**

- `fetch`: solo POST sui path webhook, verifica
  `X-Telegram-Bot-Api-Secret-Token` prima di lavoro sensibile, valida il JSON
  minimo, deduplica `update_id`, pubblica e risponde rapidamente.
- `queue`: envelope versionato, correlation e idempotency key preservate,
  errori classificati retryable/permanente, ack solo su lavoro completato o
  definitivamente fallito.
- `scheduled`: claim atomico delle righe dovute ed enqueue. Non consegna
  notifiche e non fa lavoro lungo.
- **Mai chiamare l'AI** dal webhook o dallo scheduled handler.
- Un errore qui non deve mai restituire all'utente uno stack trace o un ID interno.
