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

## DLQ prima di staging

La DLQ è un gate operativo, non solo una voce Wrangler. Prima del pilot:

1. impostare una retention limitata a 24 ore; Cloudflare consente una retention
   configurabile e una DLQ senza consumer conserva di default i messaggi per
   quattro giorni;
2. monitorare `outcome=dlq`, backlog DLQ e timestamp del messaggio più vecchio;
   alert immediato su qualunque ingresso e critico se backlog resta non zero per
   15 minuti;
3. correggere prima la causa, poi elencare un batch bounded senza ack automatico;
4. ripubblicare sulla Queue primaria il corpo invariato: stesso `jobId`,
   `correlationId`, `idempotencyKey` ed envelope versionato;
5. verificare in D1 la convergenza di inbox/effect/delivery e solo allora
   eseguire l'ack del messaggio DLQ originale.

Non ricostruire envelope, non generare nuove chiavi e non copiare payload in
ticket o log. Un replay bulk, la purge o l'ack prima della verifica richiedono
approvazione operativa esplicita. La configurazione remota della retention e
degli alert avviene soltanto nella task di provisioning staging autorizzata.

## Reply Telegram ambigua

`deliveries.status = 'ambiguous'` significa che Telegram può aver ricevuto la
richiesta ma l'esito locale non è certo. La policy A1 non invia di nuovo la reply.
Il job viene chiuso `completed_ambiguous`; identity, audit ed effect non vengono
ripetuti. Indagare usando correlation/job ID, mai token, URL Bot API o testo.

Un reinvio manuale è una nuova decisione operativa e richiede conferma; non
modificare il ledger per farlo sembrare automatico.

## Reply Telegram certamente rifiutata

`RETRYABLE_EXTERNAL` indica che il Bot API ha risposto con un rifiuto
temporaneo certo (429 o 5xx): `deliveries` torna `pending`, l'inbox torna
`enqueued` e la Queue usa il retry bounded. `PERMANENT_EXTERNAL` indica un
rifiuto permanente e chiude la delivery. Nessuno dei due rami crea una seconda
identity, domain write o riga audit; dopo l'esaurimento dei retry si applica la
procedura DLQ sopra.
