# Phase N — Routine e benessere personale

> Stato: **non attiva**. Prodotto esteso, una vertical slice per volta. È la
> fase con i dati più sensibili dell'intero prodotto. Impegno di prodotto, non
> autorizzazione a implementare.

## Outcome per slice

| Slice  | Outcome                                                                     |
| ------ | --------------------------------------------------------------------------- |
| **N1** | routine mattina e sera, abitudini, allenamenti, acqua, sonno, pause         |
| **N2** | visite, controlli, farmaci e integratori **come soli reminder configurati** |
| **N3** | energia percepita registrata e adattamenti orari opt-in                     |

## Il punto che decide la fase

**Tessavio non fa medicina.** La regola operativa, che vale per ogni riga di N:

- **nessuna diagnosi**, nessuna interpretazione clinica di un sintomo;
- **nessuna dose, nessuna posologia, nessuna terapia dedotta**. Se l'utente
  scrive "una compressa alle 8", il prodotto salva un promemoria alle 8 con il
  testo dell'utente; non modella un farmaco, non calcola intervalli, non avverte
  di interazioni;
- **nessuna soglia di normalità**: ore di sonno, acqua e allenamenti si
  registrano e si mostrano, non si giudicano;
- il linguaggio resta non clinico: "hai segnato" e non "dovresti".

N2 è tutto qui: un reminder configurato dall'utente, con sopra il nome che ha
scelto lui. Ogni riga di codice che aggiunge semantica medica a quel reminder è
fuori perimetro.

## Confini

- Dati di N classificati come **sensibili**: minimizzazione nei briefing, quiet
  hours rispettate, nessun dettaglio in anteprima di notifica;
- N3 propone adattamenti **opt-in**, con provenance, spiegazione, preview e
  controllo dell'utente: un adattamento applicato da solo sarebbe il prodotto
  che decide del corpo di qualcuno;
- nessun dispositivo, wearable o integrazione sanitaria;
- nessuna condivisione di dati di N negli spazi F senza un'azione esplicita e
  separata.

## Decisioni da prendere prima

- [ ] classificazione esatta dei dati di N nella
      [DATA_POLICY](../../privacy/DATA_POLICY.md) e retention conseguente;
- [ ] se i dati di N possono comparire nel briefing di G e con quale dettaglio.
      Raccomandazione predefinita: **no**, salvo opt-in esplicito per categoria;
- [ ] cosa succede ai dati di N all'export e alla cancellazione di I2, dato che
      possono richiedere un trattamento più stretto degli altri;
- [ ] revisione del wording di ogni messaggio di N prima del rilascio: qui il
      difetto tipico è una frase, non un bug.

## Rischi principali

| Rischio                                              | Mitigazione                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Semantica medica introdotta per comodità             | N2 è solo un reminder; test sul wording e sull'assenza di dose |
| Dato sanitario in anteprima di notifica              | classificazione sensibile, minimizzazione, quiet hours         |
| Adattamento applicato senza consenso                 | N3 sempre opt-in, con preview e provenance                     |
| Dati di N che finiscono in un briefing condiviso     | esclusi per default, opt-in per categoria                      |
| Giudizio implicito nei messaggi                      | linguaggio non valutativo, revisione dedicata                  |
| Ricorrenze delle routine che sbagliano al cambio ora | property test DST come per B6.2                                |

## Criteri di uscita

- [ ] nessuna diagnosi, dose, posologia o terapia in alcun percorso, provato
      con test sul contenuto oltre che sul codice;
- [ ] wording non clinico e non valutativo, revisionato prima del rilascio;
- [ ] classificazione sensibile applicata a persistenza, log, briefing ed export;
- [ ] N3 opt-in con provenance, spiegazione e preview, mai automatico;
- [ ] recurrence e completamenti idempotenti, con property test DST;
- [ ] opt-out immediato e dedupe delle notifiche verificati;
- [ ] isolamento cross-tenant su ogni entità di N;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.
