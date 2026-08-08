# Recovery A1

Usare solo ID opachi e codici di stato nei ticket e nei log. Non copiare
`envelope_json`, testo utente, secret o token in console condivise.

## Inbox bloccato prima del publish

Il Cron eseguito ogni minuto seleziona fino a 100 record `pending_enqueue` più
vecchi di 30 secondi e pubblica lo stesso envelope. Un crash dopo il publish può
generare una seconda consegna fisica, ma effect e delivery ledger impediscono una
seconda esecuzione logica.

Diagnosi redatta:

```powershell
npx wrangler d1 execute DB --env staging --remote --command "SELECT status, COUNT(*) AS total FROM inbound_updates GROUP BY status"
```

Se i pending crescono, verificare Queue binding/lag e il codice evento
`inbox.recovery_failed`. Non cambiare manualmente `job_id` o idempotency key.

## Job poison o retry storm

Envelope non validi vengono ackati e registrati come `queue.invalid_envelope`
senza payload. Errori retryable usano la lease inbox e dopo cinque retry arrivano
alla DLQ configurata. Prima del replay correggere la causa e riutilizzare lo
stesso envelope; non creare una nuova chiave logica.

Per fermare una tempesta, mettere in pausa il consumer Queue dal controllo
Cloudflare, non cancellare D1. La purge della Queue è distruttiva e richiede
autorizzazione esplicita.

## Reply Telegram ambigua

`deliveries.status = 'ambiguous'` significa che Telegram può aver ricevuto la
richiesta ma l'esito locale non è certo. La policy A1 non invia di nuovo la reply.
Il job viene chiuso `completed_ambiguous`; identity, audit ed effect non vengono
ripetuti. Indagare usando correlation/job ID, mai token, URL Bot API o testo.

Un reinvio manuale è una nuova decisione operativa e richiede conferma; non
modificare il ledger per farlo sembrare automatico.
