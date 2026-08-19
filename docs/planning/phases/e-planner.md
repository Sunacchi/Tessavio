# Phase E — Planner deterministico

> Stato: **non attiva**. Dipende da B (dati) e C (normalizzazione vincoli).

- [ ] definire input normalizzati: finestra, durata, precedenze, blocchi,
      disponibilità, preferenze e hard/soft constraints;
- [ ] chiedere la durata mancante o proporla come assunzione revisionabile e
      dividere task grandi in passi senza applicarli automaticamente;
- [ ] costruire la vista deterministica degli impegni da D1 con timezone corretta;
- [ ] implementare conflict detector e allocatore senza dipendenza AI;
- [ ] distinguere piano impossibile, parziale e completo con motivazioni verificabili;
- [ ] applicare un limite di carico e rispettare turni, sonno, impegni e preferenze;
- [ ] permettere all'AI solo normalizzazione vincoli e spiegazione, mai allocazione finale;
- [ ] mostrare preview con spostamenti, conflitti, assunzioni e scope;
- [ ] applicare il piano in transazione/idempotency boundary e produrre Undo coerente;
- [ ] gestire modifica concorrente tra preview e apply con stale-version rejection;
- [ ] riprogrammare incomplete conservando il motivo e richiedendo conferma per
      modifiche significative;
- [ ] aggiungere property test per overlap, finestre, precedenze, durata e DST;
- [ ] aggiungere dataset planner e metriche constraint-compliance/usefulness;
- [ ] dimostrare identico risultato deterministico a parità di input/clock/config.
- [ ] validare migration E eventuali con compatibilità N-1/N e recovery.

UX: “pianificami la settimana” restituisce un piano revisionabile; se i vincoli non
stanno nel tempo disponibile il sistema spiega cosa resta fuori e non forza slot.
