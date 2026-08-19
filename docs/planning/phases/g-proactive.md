# Phase G — Briefing e assistenza proattiva

> Stato: **non attiva**. Dipende da B, E, F.

- [ ] introdurre prima G1 con preferenze contenuto/orario/frequenza, quiet hours e
      briefing mattutino su soli domini B completati;
- [ ] rendere il riepilogo serale opt-in e separato dal briefing mattutino;
- [ ] comporre eventi, task, scadenze, turni e reminder tramite porte applicative
      autorizzate, senza query cross-domain libere;
- [ ] aggiungere G2 settimanale/mensile usando soltanto i domini B effettivamente
      completati; non richiedere spese programmate, forecast o capability K1-K3;
- [ ] usare schedule/claim/delivery dedupe per una sola notifica logica e gestire
      late delivery, retry e cambio preferenze concorrente;
- [ ] definire tono conciso e non ansiogeno; nessun dettaglio sensibile superfluo;
- [ ] far degradare un contributor senza bloccare o duplicare l'intero briefing;
- [ ] in G3 definire soltanto il contratto bounded e tipizzato dei contributor,
      con isolamento, timeout e graceful degradation; non attivare né anticipare
      documenti, persone, casa, viaggi o benessere;
- [ ] testare quiet hours, DST, duplicate Cron/Queue, contributor failure,
      opt-out e non-visibilità cross-tenant;
- [ ] validare schema/migration/recovery e retention dei delivery snapshot G.
