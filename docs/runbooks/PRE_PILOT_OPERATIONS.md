# Gate operativi pre-pilot

Questo runbook definisce evidenze e trigger; non autorizza deploy, provisioning,
query remote o modifica di alert.

## Capacità del D1 condiviso

Cloudflare documenta che ogni singolo D1 è single-threaded, processa le query una
alla volta, può restituire errori `overloaded` quando la coda interna è piena e
ha un limite non aumentabile di 10 GB
([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).
Il database condiviso resta valido finché le misure sotto rimangono nel budget.

Prima della beta eseguire un load test staging con dataset sintetico
rappresentativo e fissare la capacità write sostenibile. Usare nomi operazione
stabili e tenant-free nelle metriche; non esportare SQL, payload o ID personali.

| Segnale          | Misura                                              | Revisit trigger                                      | Blocco pilot senza mitigazione                             |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| dimensione D1    | byte database e crescita settimanale                | >= 5 GB o previsione di raggiungerli entro 90 giorni | >= 7,5 GB senza piano di partizionamento e prova migration |
| p95 query hot    | latenza per nome operazione su finestra 15 minuti   | > 50 ms o > 2x baseline staging                      | > 100 ms dopo indici/query-plan review                     |
| `overloaded`     | conteggio e percentuale su query D1                 | qualunque evento apre alert/diagnosi                 | > 0,1% per 5 minuti o ricorrenza non spiegata              |
| write throughput | write/s rispetto alla capacità sostenibile misurata | > 70% per 15 minuti                                  | > 85%, crescita non bounded o code D1 osservate            |
| Queue lag        | p95 `lagTime` e oldest-message age                  | p95 > 30 s per 5 minuti                              | p95 > 60 s per 15 minuti                                   |
| DLQ              | ingressi, backlog e oldest-message age              | qualunque ingresso                                   | backlog non zero per 15 minuti senza owner/incidente       |

I valori sono budget iniziali conservativi, non limiti Cloudflare. Il report di
load test deve registrarne eventuali modifiche con motivazione e ADR. Un trigger
non autorizza automaticamente sharding: apre la rivalutazione di ADR-0003,
preservando `UserScope`/`SpaceScope`, idempotenza e migration recovery.

Cloudflare Queues espone backlog, lag, retry e outcome `dlq`, oltre al timestamp
del messaggio più vecchio
([Queues metrics](https://developers.cloudflare.com/queues/observability/metrics/)).

## DLQ e replay

Prima di staging, completare la sezione DLQ di
[A1_RECOVERY.md](A1_RECOVERY.md): retention 24 ore, alert, owner di incidente e
replay bounded con envelope e idempotency key invariati. Cloudflare invia in DLQ
dopo `max_retries`; una DLQ senza consumer conserva di default i messaggi per
quattro giorni
([Dead Letter Queues](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)).
La retention della Queue è configurabile fino a 14 giorni
([Queues limits](https://developers.cloudflare.com/queues/platform/limits/)).

## Privacy, residenza e DPIA

Il go/no-go deve allegare la
[matrice di residenza e subprocessori](../privacy/PROCESSOR_AND_RESIDENCY_MATRIX.md),
la DPIA approvata e l'evidenza tecnica/contrattuale per ogni flusso. Nessuna
spunta “D1 EU” sostituisce questi gate.
