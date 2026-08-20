# ADR-0020 — B7 report base trasversali e CSV bounded

- Status: accepted
- Date: 2026-08-19

## Context

B1-B6.2 espongono già letture private e deterministiche per agenda, task,
lavoro e finanze. B7 deve comporle senza creare una tabella report, senza query
cross-domain libere e senza trasformare il report in una nuova fonte della
verità. Il periodo deve conservare semantica civile nella timezone del profilo;
il CSV può contenere testo scelto dall'utente e deve essere sicuro da aprire in
un foglio di calcolo.

## Decision

Il comando `/report <inizio> <fine>` produce un riepilogo `base-report-v1` e
`/report csv <inizio> <fine>` consegna un documento CSV. Le date sono civili,
inclusive, nella timezone IANA del profilo, per un massimo di 366 giorni. I
confini UTC sono risolti con Temporal, quindi giorni DST di 23 o 25 ore non
vengono forzati a 24 ore.

L'application layer orchestra quattro contributor già proprietari dei dati:

- agenda: eventi attivi date-only nel range o instant sovrapposti alla finestra;
- task: task aperte o completate con scadenza date-only/instant nel range; le
  task senza scadenza non appartengono a un report per periodo;
- lavoro: riuso integrale di `work-report-v1`, inclusi clamp, snapshot regola e
  minuti pianificati/lordi/pausa/conteggiati;
- finanze: soli movimenti attivi, somme `bigint` separate per valuta e formula
  entrate meno spese, senza conversione.

Ogni repository riceve `UserScope`; l'authorization `reports:read` precede ogni
lettura. Ogni dominio è limitato a 500 contributori. Se almeno un contributor
supera il limite, l'intero report viene rifiutato senza totale parziale. Il
riepilogo mostra formula, timezone, conteggi e ID di provenance bounded; il CSV
contiene tutti gli ID e le righe contributrici ammesse, oltre alle metriche
calcolate.

Il CSV usa quoting RFC 4180, UTF-8, CRLF, limite difensivo di 5 MB e neutralizza
testo che potrebbe essere interpretato come formula da un foglio di calcolo.
Viene costruito in memoria e inviato come documento Telegram attraverso lo
stesso delivery ledger idempotente delle risposte; non viene persistito in D1,
log, audit o storage. B7 è read-only: non introduce audit di mutation o Undo.

Non vengono aggiunti schema, migration, binding, Queue, Cron, dipendenze, AI o
integrazioni esterne.

## Consequences

- D1 resta autorevole e ogni dominio conserva proprietà e query proprie;
- retry fisici non inviano due volte il documento dopo una delivery conclusa;
- un report non confonde record cancellati, task senza scadenza o valute diverse;
- il limite per dominio rende costo, memoria e dimensione export espliciti;
- il CSV B7 è un export del report selezionato, non l'export completo dei diritti
  utente previsto da I2 e non autorizza import CSV o analisi K4.

## Revisit when

G introduce delivery proattiva dei riepiloghi, I2 aggiunge export account
completo, K4 aggiunge confronto periodi/import CSV, oppure nuovi domini entrano
nel contratto contributor. Queste fasi non possono aggirare scope, limiti,
provenance o policy di conflitto.
