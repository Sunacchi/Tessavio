# ADR-0014 — B2 reminder one-off, quiet hours e delivery leased

- Status: accepted
- Date: 2026-08-08

## Context

B2 deve attraversare D1, Cron, Cloudflare Queue e Telegram senza una transazione
distribuita. Cron e Queue sono at-least-once, mentre un timeout dopo la richiesta
Telegram non consente di sapere se il messaggio sia stato ricevuto. Il dominio
deve restare deterministico, privato e utilizzabile senza AI.

## Decision

Il reminder one-off conserva testo, instant UTC richiesto, timezone IANA
originale, instant effettivo di delivery, stato/versione e soli metadati
operativi necessari al claim. Il comando accetta una ora civile locale solo se
Temporal la risolve in un singolo instant e se è futura rispetto al timestamp
del messaggio.

Le quiet hours sono parte versionata delle preferenze. Il consumer usa le
preferenze correnti subito prima della delivery e persiste lo snapshot minimo
(`preference_version`, inizio/fine in minuti locali). Se l'istante è nella
finestra, rilascia il claim e sposta `due_at_utc` alla prossima fine della
finestra; per gap/fold DST usa Temporal con disambiguation `later`.

Il Cron è l'unico capability path autorizzato a scansionare l'indice globale dei
due reminder. La discovery legge solo `id`, `user_id` e timestamp; ogni claim e
accesso successivo include `(id, user_id)` e ricostruisce immediatamente
`UserScope`. Non esiste una query di contenuto reminder per ID nudo.

Il claim applica `pending -> claimed` con update condizionale, job/correlation ID
persistiti e lease. L'enqueue può essere ripetuto fisicamente; recovery e replay
mantengono envelope, job ID e idempotency key invariati. La cancellazione utente
è ammessa solo da `pending`: dopo il claim l'utente riceve un esito esplicito
anziché una falsa garanzia di arrestare un invio concorrente.

La delivery usa il ledger `notification_deliveries` e dedupe key
`telegram-reminder:<id>`. La policy Telegram è:

- risposta certa 429/5xx: `RETRYABLE_EXTERNAL`, ledger pending e retry bounded;
- rifiuto certo permanente: `permanent_failure` senza retry;
- errore HTTP/rete senza esito affidabile: `ambiguous`, policy at-most-once;
- successo: `sent` con remote message ID.

La Queue applica massimo 5 retry per enqueue e l'applicazione limita a 6 le
chiamate esterne complessive. Se un messaggio finisce in DLQ e la lease scade,
il recovery può ripubblicare lo stesso job ma non può superare il limite
applicativo.

Create e cancel sono auditati e producono Undo `rem_` user-bound, single-use,
TTL 15 minuti e version check. Claim, defer e delivery sono transizioni
operative osservate con log strutturati privi di contenuto personale.

## Consequences

- una sola esecuzione logica è garantita; exactly-once fisico non viene promesso;
- un invio ambiguo richiede riconciliazione manuale e non viene ripetuto;
- cambiare quiet hours prima del consumer influenza un reminder già creato e lo
  snapshot rende diagnosticabile la decisione;
- reminder ricorrenti, collegamenti cross-domain e spazi restano fuori B2;
- il due-index globale è una capability infrastrutturale stretta, non una porta
  disponibile ai normali use case utente.

## Revisit when

Telegram offre idempotency keys end-to-end, i dati beta richiedono una policy
diversa per gli ambiguous, oppure B6 introduce ricorrenze locali.
