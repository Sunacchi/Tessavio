# Phase O — Convergenza del prodotto esteso

> Stato: **non attiva**. È il **gate di chiusura del prodotto esteso**, come I
> lo è della core beta: non aggiunge domini, dimostra che quelli esistenti
> stanno insieme. Impegno di prodotto, non autorizzazione a implementare.

## Outcome

| Blocco | Outcome                                                                 |
| ------ | ----------------------------------------------------------------------- |
| **O1** | ricerca e collegamenti cross-domain attraverso porte autorizzate        |
| **O2** | contributor J-N accesi sul contratto G3, con degradazione per singolo   |
| **O3** | export, delete, retention e recovery completati per J-N                 |
| **O4** | benchmark multimodale, load e restore, review security e privacy estesa |
| **O5** | matrice requisito → acceptance test → evidenza, pilot esteso, chiusura  |

## Il punto che decide la fase

**O è dove si paga il conto di ogni scorciatoia presa da J a N.** Le tre voci
che tipicamente non sono pronte e che vanno verificate per prime:

1. **Export e delete per J-N.** Ogni dominio esteso ha aggiunto entità; se
   anche uno solo non è coperto da export e cancellazione, I2 non è più vero e
   la promessa fatta all'utente in beta è decaduta senza che nessuno se ne
   accorga.
2. **La ricerca cross-domain è il posto più facile dove perdere lo scope.** Una
   query che attraversa dieci domini per trovare "biglietto" deve applicare
   authorization su ognuno, non una volta all'ingresso. Se passa dalle porte
   autorizzate, funziona; se qualcuno ha aggiunto una query diretta per
   comodità, è lì che si trova.
3. **I contributor di G3 vanno accesi uno per volta**, solo per i domini che
   hanno chiuso i propri gate, e con la degradazione già provata in G: accenderli
   tutti insieme rende impossibile capire quale rallenta o rompe il briefing.

## Confini

- O **non introduce nuovi domini**. Qualunque cosa emerga dal pilot esteso e non
  sia un blocker va nel [backlog](../BACKLOG.md), non in O.
- La ricerca cross-domain non ha accesso diretto alle tabelle: solo porte
  autorizzate, come già stabilito per il briefing di G.
- Nessun contributor si attiva prima che il suo dominio abbia chiuso i gate.

## Decisioni da prendere prima

- [ ] regola sui finding residui del pilot esteso: quali severità bloccano la
      chiusura e quali si accettano per iscritto;
- [ ] ordine di accensione dei contributor J-N;
- [ ] perimetro della ricerca cross-domain: quali domini include e cosa restituisce
      a chi ha accesso parziale a un risultato;
- [ ] se il pilot esteso usa gli stessi partecipanti di I3.3 o un gruppo nuovo.

## Rischi principali

| Rischio                                          | Mitigazione                                             |
| ------------------------------------------------ | ------------------------------------------------------- |
| Un dominio J-N escluso da export o delete        | matrice di copertura verificata dominio per dominio     |
| Scope perso nella ricerca cross-domain           | authorization per dominio, mai una sola all'ingresso    |
| Contributor accesi tutti insieme                 | attivazione incrementale con degradazione provata       |
| O usata per aggiungere funzionalità              | confine esplicito: ciò che non è blocker va nel backlog |
| Chiusura dichiarata senza evidenze riproducibili | ogni criterio punta a un test, una misura o un report   |

## Criteri di uscita

- [ ] ricerca e link cross-domain passano solo da porte autorizzate, con test
      negativo per ogni dominio incluso;
- [ ] i contributor attivi sono solo quelli dei domini con gate chiusi, e uno
      che fallisce degrada senza bloccare né duplicare;
- [ ] export, delete, retention, purge e recovery completi e provati per J-N;
- [ ] benchmark multimodale aggiornato, load test e restore eseguiti;
- [ ] review security e privacy estesa chiusa **con zero finding P0/P1**;
- [ ] matrice requisito → acceptance test → evidenza pubblicata e aggiornata;
- [ ] pilot del prodotto esteso eseguito e feedback triagiato;
- [ ] chiusura firmata secondo [RELEASE_CLOSURE.md](../RELEASE_CLOSURE.md);
- [ ] `npm run validate` verde.
