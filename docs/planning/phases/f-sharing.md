# Phase F — Multiuser Sharing

> Stato: **non attiva**. Introduce `SpaceScope`.

- [ ] definire spazi, membership, inviti, ruoli e capability matrix in un ADR;
- [ ] mantenere dati esistenti privati senza migrazione implicita;
- [ ] implementare inviti one-time, user-bound/recipient-bound, expiring e revocabili;
- [ ] richiedere `SpaceScope { userId, spaceId }` per ogni repository condiviso;
- [ ] verificare membership, ruolo e resource scope a ogni read/write;
- [ ] introdurre prima una singola vertical slice condivisa (lista o evento);
- [ ] aggiungere in F2 calendario familiare e attività/faccende assegnate;
- [ ] aggiungere in F3 spese condivise, split, debiti e crediti registrati in
      minor unit, senza disporre pagamenti;
- [ ] rendere sempre visibile nel messaggio se l'azione è privata o condivisa;
- [ ] richiedere preview per azioni bulk/condivise e auditare l'attore reale;
- [ ] gestire leave, revoke, ultimo owner, delete space e risorse orfane;
- [ ] testare role downgrade, invito riusato/forgiato, callback di altro utente,
      space mismatch e non-visibilità dei dati privati;
- [ ] aggiungere indici membership/space e query-plan evidence per hot path;
- [ ] validare migration F con worker N-1/schema N e test su owner/space non null;
- [ ] chiudere con review security senza leakage P0/P1.
