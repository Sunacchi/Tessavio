# Phase K — Finanze avanzate

> Stato: **non attiva**. Prodotto esteso, una vertical slice per volta. Dipende
> da B5 (registro manuale già chiuso). Impegno di prodotto, non autorizzazione
> a implementare.

## Outcome per slice

| Slice  | Outcome                                                                      |
| ------ | ---------------------------------------------------------------------------- |
| **K1** | regole personali e ricorrenze: stipendio, affitto, utenze, abbonamenti, rate |
| **K2** | budget totale e per categoria, risparmio e fondi futuri                      |
| **K3** | scadenziario e forecast deterministico, dichiarato come stima                |
| **K4** | report per giorno, settimana, mese e anno, confronto periodi e import CSV    |

## Il punto che decide la fase

**Il forecast è il primo output che l'utente può scambiare per consulenza.** Il
prodotto non consiglia e non muove denaro: proietta dati registrati con una
formula. Quindi ogni previsione mostra, sempre e senza doverlo chiedere:

- **su quali dati** è costruita e per quale periodo;
- **quale formula e quale versione** ha usato;
- **cosa manca** — un mese senza registrazioni è un buco visibile, non uno zero;
- l'etichetta esplicita di **stima, non consulenza**.

Una previsione senza queste quattro cose è peggio di nessuna previsione, perché
sembra affidabile.

## Confini

- **Open Banking escluso definitivamente** ([ADR-0009](../../decisions/0009-no-open-banking.md)):
  nessuna credenziale, nessun provider, nessun adapter, nessuna tabella
  bancaria. Uno scan automatico deve **impedirne l'introduzione**, non solo
  verificarne l'assenza.
- L'import CSV è uno use case di dominio manuale con preview, dedupe e rollback,
  non un'integrazione.
- Gli aumenti di abbonamento si rilevano **soltanto** dalla cronologia
  registrata, con confronto e provenance: non si stimano e non si cercano
  altrove.
- Le categorie restano sempre modificabili dall'utente: nessun enum imposto.
- Nessun pagamento, nessun trasferimento, nessuna disposizione.

## Decisioni da prendere prima

- [ ] **Motore delle ricorrenze.** B6.2 ha deliberatamente evitato un motore
      generico e usa solo daily/weekly. Le ricorrenze finanziarie (mensile al
      giorno 31, bimestrale, rate a scadenza) sono più ricche: decidere se
      estendere il modello esistente o se questa è la fase che giustifica
      `rrule`, che `AGENTS.md` ammette **solo** nella fase ricorrenze. È la
      decisione più impattante di K.
- [ ] Cosa fa una ricorrenza mensile in un mese che non ha quel giorno.
- [ ] Se il budget è un vincolo che avvisa o un semplice riferimento.
- [ ] Formato e tolleranza dell'import CSV, e cosa costituisce un duplicato.

## Rischi principali

| Rischio                                               | Mitigazione                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| Forecast percepito come consulenza                    | dati, periodo, formula, versione e disclaimer sempre visibili |
| Motore di ricorrenza generico introdotto di soppiatto | decisione esplicita prima di K1                               |
| Import CSV che duplica movimenti                      | preview, dedupe e rollback provati                            |
| Arrotondamenti che non tornano                        | minor unit intere e property test su split e totali           |
| Deriva verso l'Open Banking                           | scan automatico su schema, dipendenze e configurazione        |
| Buchi di dati nascosti dietro uno zero                | i dati mancanti sono visibili, mai normalizzati a zero        |

## Criteri di uscita

- [ ] ogni importo in unità minori intere, mai `float`, con property test su
      split, totali e ricorrenze;
- [ ] il forecast espone dati, periodo, formula, versione e disclaimer;
- [ ] i dati mancanti sono mostrati come mancanti;
- [ ] import CSV con preview, dedupe e rollback provati end-to-end;
- [ ] isolamento economico cross-tenant verificato su ogni vista aggregata;
- [ ] scan che conferma l'assenza di Open Banking in schema, dipendenze e config;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.
