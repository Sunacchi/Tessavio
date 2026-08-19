# Phase M — Viaggi

> Stato: **non attiva**. Prodotto esteso, una vertical slice per volta. Dipende
> da B (eventi, task, spese), da D3 e J per le prenotazioni acquisite, da F se
> il viaggio è condiviso. Impegno di prodotto, non autorizzazione a implementare.

## Outcome per slice

| Slice  | Outcome                                                                      |
| ------ | ---------------------------------------------------------------------------- |
| **M1** | viaggio creato a mano: date, tappe, indirizzi, partecipanti, attività, scope |
| **M2** | prenotazioni inoltrate, check-in e documenti acquisiti tramite D3 e J        |
| **M3** | collegamento a budget, spese, itinerario, valigia e task pre-partenza        |

## Il punto che decide la fase

**Un viaggio è la prima entità con più di una timezone.** Ogni tappa ha la sua
zona IANA, e l'invariante 7 smette di essere "la timezone dell'utente": diventa
"la timezone della tappa". Le conseguenze sono concrete:

- l'orario di un'attività appartiene alla tappa, non al viaggio;
- un reminder "due ore prima del volo" si calcola nella zona di partenza, e
  quello di arrivo in quella di destinazione;
- la vista `/oggi` durante un viaggio deve restare comprensibile: mostrare
  quale zona sta usando è parte del contratto, non un dettaglio.

Chi implementa M senza modellare la timezone per tappa produce reminder
sbagliati proprio quando l'utente ne ha più bisogno.

## Confini

- **Nessuna mappa, nessun meteo, nessuna API di prenotazione.** Il flusso
  completo si deve poter dimostrare senza alcuna integrazione esterna.
- M3 **collega** i domini esistenti, non ne copia i record: le spese di viaggio
  sono spese di B5 con un riferimento tipizzato, non una tabella parallela.
- Nessun acquisto, nessuna disposizione di pagamento.
- Le prenotazioni acquisite in M2 seguono il ciclo di vita di D3 e J: estrazione
  transitoria, e archiviazione solo come use case esplicito.

## Decisioni da prendere prima

- [ ] modello della tappa: quale granularità e come si rappresenta uno
      spostamento fra due zone;
- [ ] se un viaggio può essere condiviso in M1 o solo dopo F;
- [ ] cosa accade alle attività di una tappa quando la tappa viene spostata o
      cancellata;
- [ ] quale parte del documento di prenotazione viene conservata e quale scartata.

## Rischi principali

| Rischio                                            | Mitigazione                                                  |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Timezone del viaggio invece che della tappa        | zona IANA per tappa, property test sui cambi di zona         |
| Spese di viaggio duplicate rispetto a B5           | riferimento tipizzato, nessuna tabella parallela             |
| Attività orfane dopo lo spostamento di una tappa   | comportamento deciso prima, non dedotto                      |
| Documento di prenotazione conservato senza volerlo | ciclo di vita di D3: transitorio salvo richiesta esplicita   |
| Update concorrenti su un viaggio condiviso         | version check e ruolo verificato alla write                  |
| Aspettativa implicita di mappe o meteo             | confine dichiarato: il flusso si dimostra senza integrazioni |

## Criteri di uscita

- [ ] ogni tappa porta la propria zona IANA e i reminder la rispettano;
- [ ] property test su cambio di zona, attraversamento del giorno e DST;
- [ ] nessun record di spesa, task o evento duplicato: solo collegamenti;
- [ ] documenti trattati secondo il ciclo di vita di D3 e J, con authorization;
- [ ] update concorrente su viaggio condiviso risolto con version check;
- [ ] link cancellati gestiti senza riferimenti orfani;
- [ ] il flusso completo dimostrato senza mappe, meteo o API di prenotazione;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.
