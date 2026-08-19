# Phase J — Documenti, amministrazione e persone

> Stato: **non attive**. Prodotto esteso, una vertical slice per volta.

- [ ] J1 introduce registro documenti, categorie/scadenze/reminder e ricerca
      metadata per una sola categoria iniziale, poi estende senza enum rigidi;
- [ ] J2 separa raw Inbox transitorio, estratto con provenance e originale
      archiviato/cifrato solo per use case esplicito;
- [ ] collegare documenti a entità esistenti con riferimenti tipizzati e scope su
      entrambe le risorse, senza tabella polimorfa universale anticipata;
- [ ] J3 introduce persone interne, compleanni/anniversari, ultime interazioni e note;
- [ ] J4 aggiunge cose da chiedere, promesse, follow-up, regali e oggetti/denaro
      prestati, senza pagamenti o comportamento CRM;
- [ ] testare extraction provenance/correction, ricerca e delete, reminder dedupe,
      encryption/retention, cross-tenant e link orfani/revocati.

## Phase K — Finanze avanzate

- [ ] K1 aggiunge regole personali, ricorrenze, stipendio, affitto, utenze,
      abbonamenti e rate con categorie sempre modificabili;
- [ ] rilevare aumenti di abbonamento soltanto dalla cronologia registrata e
      mostrare confronto/provenance;
- [ ] K2 aggiunge budget totale/per categoria, risparmio e fondi futuri in minor unit;
- [ ] K3 costruisce scadenziario e forecast deterministico con formula/versione,
      dati mancanti visibili e disclaimer “stima, non consulenza”;
- [ ] K4 aggiunge report giorno/settimana/mese/anno, confronto periodi e import CSV
      manuale con preview, dedupe e rollback;
- [ ] provare minor unit/split/recurrence con property test e isolamento economico;
- [ ] eseguire scan che confermi assenza di Open Banking in schema/dipendenze/config.

## Phase L — Casa, famiglia e pasti

- [ ] L1 aggiunge manutenzione, scadenze, animali, figli e liste vacanza sopra gli
      spazi F, mantenendo private-by-default e assegnazioni esplicite;
- [ ] L2 aggiunge inventario, quantità/unità, prodotti da ricomprare e alimenti in
      scadenza con concorrenza condivisa e Undo;
- [ ] L3 aggiunge preferenze, allergie/esclusioni, pasti, ricette da disponibilità
      e lista spesa derivata con preview bulk;
- [ ] trattare allergie/esclusioni come hard constraint e non inventare
      compatibilità alimentare;
- [ ] testare role denial, membership revocata, update concorrenti, reminder
      dedupe e derivazione lista senza duplicare item.

## Phase M — Viaggi

- [ ] M1 crea viaggio manuale con date, tappe/timezone, indirizzi, partecipanti,
      attività e scope privato/shared;
- [ ] M2 acquisisce prenotazioni inoltrate, check-in e documenti tramite D3/J,
      conservando provenance e reminder;
- [ ] M3 collega budget/spese, itinerario, valigia/spesa e task pre-partenza ai
      domini esistenti senza copiarne i record;
- [ ] testare cambio timezone per tappa, update concorrente shared, document
      authorization, minor unit e link cancellati;
- [ ] dimostrare il flusso completo senza mappe, meteo o API di prenotazione.

## Phase N — Routine e benessere personale

- [ ] N1 aggiunge routine mattina/sera, abitudini, allenamenti, acqua, sonno e
      pause con recurrence locale e completamenti idempotenti;
- [ ] N2 usa visite, controlli, farmaci e integratori soltanto come reminder
      configurati dall'utente, senza dose o terapia inferita;
- [ ] N3 registra energia percepita e propone adattamenti orari opt-in con
      provenance, spiegazione, preview e controllo utente;
- [ ] applicare data classification sensibile, quiet hours e minimizzazione nei briefing;
- [ ] testare DST/recurrence, notification dedupe, opt-out, wording non clinico,
      assenza di diagnosi/prescrizioni e isolamento cross-tenant.

## Phase O — Convergenza del prodotto esteso

- [ ] aggiungere ricerca e link cross-domain soltanto tramite porte autorizzate;
- [ ] attivare con graceful degradation i contributor J-N il cui dominio ha
      completato i propri gate, usando il contratto definito in G3;
- [ ] completare export/delete, retention/purge e recovery per J-N;
- [ ] eseguire benchmark multimodale, load/restore e review security/privacy estesa;
- [ ] pubblicare matrice requisito -> acceptance test -> evidenza aggiornata;
- [ ] eseguire pilot del prodotto esteso e chiudere con zero finding P0/P1.
