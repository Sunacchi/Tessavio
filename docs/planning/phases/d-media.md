# Phase D — Voice + Vision transitori

> Stato: **non attiva**. Dipende da C.

- [ ] definire threat model, limiti dimensione/tipo/durata e retention prima del download;
- [ ] scaricare media Telegram solo nel consumer, mai nel webhook;
- [ ] usare storage transitorio e cancellazione in `finally` anche su timeout/errori;
- [ ] implementare STT come capability dedicata con testo revisionabile;
- [ ] passare la trascrizione allo stesso pipeline `ActionProposal` del testo;
- [ ] implementare vision con extraction strutturata e provenance per elemento;
- [ ] richiedere preview obbligatoria per batch, immagini con più entità o bassa certezza;
- [ ] impedire persistenza raw media e logging di URL/file/payload;
- [ ] applicare budget, privacy e fallback capability-aware anche ai media;
- [ ] testare formati non validi, file eccessivo, zip/bomb-like input, timeout,
      cancellazione, partial extraction e doppio delivery;
- [ ] aggiornare benchmark con voce italiana, screenshot e immagini sintetiche;
- [ ] verificare automaticamente che media e riferimenti transitori siano eliminati.
- [ ] validare migration D eventuali e lifecycle/purge dei soli metadata consentiti.
- [ ] aggiungere D3 per PDF/documenti supportati, ricevute, scontrini, bollette e
      prenotazioni con allowlist, limiti, parser bounded e routing ai domini;
- [ ] separare extraction transitoria dall'eventuale archivio cifrato J.

UX: l'utente vede “sto elaborando” solo quando utile, può correggere trascrizione o
righe estratte e conferma sempre le importazioni multiple prima della write.
