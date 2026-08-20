# Phase L — Casa, famiglia e pasti

> Stato: **non attiva**. Prodotto esteso, una vertical slice per volta.
> **Dipende da F**: senza spazi condivisi, manutenzione e inventario familiari
> non hanno destinatario. Impegno di prodotto, non autorizzazione a implementare.

## Outcome per slice

| Slice  | Outcome                                                                         |
| ------ | ------------------------------------------------------------------------------- |
| **L1** | manutenzione, scadenze, animali, figli e liste vacanza sopra gli spazi F        |
| **L2** | inventario con quantità e unità, prodotti da ricomprare, alimenti in scadenza   |
| **L3** | preferenze e allergie, pasti, ricette dalla disponibilità, lista spesa derivata |

## Il punto che decide la fase

**Allergie ed esclusioni sono vincoli rigidi, non preferenze.** Una ricetta
proposta a chi ha un'allergia non è un suggerimento imperfetto: è un danno. Da
qui tre regole non negoziabili:

- l'esclusione filtra **prima** che qualsiasi proposta venga costruita, non
  dopo;
- il sistema **non deduce** compatibilità alimentare da nomi, categorie o
  somiglianze: se un ingrediente non è dichiarato compatibile, non lo è;
- nel dubbio si mostra l'ingrediente e si lascia decidere l'utente, non si
  sceglie per lui.

Il secondo punto è quello che l'implementazione tende a violare: "senza latte"
non si risolve cercando la parola "latte" nel nome di un prodotto.

## Confini

- L1, L2 e L3 vivono **sopra** gli spazi di F: private-by-default, assegnazioni
  esplicite, nessuna visibilità implicita.
- La lista della spesa derivata **non duplica** gli item: è una vista o un
  collegamento tipizzato verso liste e inventario, non una terza copia.
- Nessuna integrazione con negozi, consegne o API di prodotto.
- Nessun consiglio nutrizionale o dietetico: il prodotto organizza ciò che
  l'utente dichiara.

## Decisioni da prendere prima

- [ ] granularità di quantità e unità di misura, e come si sommano unità diverse;
- [ ] chi può modificare l'inventario condiviso e cosa succede a due modifiche
      concorrenti sulla stessa quantità;
- [ ] come si dichiara un'allergia e chi può vederla dentro uno spazio: è un
      dato sensibile che riguarda una persona, non lo spazio;
- [ ] se la lista spesa derivata è ricalcolata o materializzata, e chi la possiede.

## Rischi principali

| Rischio                                            | Mitigazione                                           |
| -------------------------------------------------- | ----------------------------------------------------- |
| Compatibilità alimentare dedotta                   | solo dichiarazioni esplicite; nel dubbio si mostra    |
| Allergia visibile a tutto lo spazio                | visibilità decisa prima, dato trattato come sensibile |
| Lista spesa che duplica item di liste e inventario | vista o collegamento tipizzato, mai una terza copia   |
| Modifiche concorrenti alla stessa quantità         | version check e Undo, come nelle liste di B6.1        |
| Membership revocata mentre un'attività è assegnata | il ruolo si verifica alla write, non alla lettura     |
| Reminder domestici che si moltiplicano             | dedupe per notifica logica, come in B2                |

## Criteri di uscita

- [ ] allergie ed esclusioni filtrano prima della proposta e non sono mai dedotte;
- [ ] la lista spesa derivata non duplica alcun item;
- [ ] update concorrenti su inventario condiviso risolti con version check e Undo;
- [ ] ruolo negato e membership revocata testati su ogni operazione condivisa;
- [ ] reminder domestici deduplicati per notifica logica;
- [ ] test cross-tenant e cross-space su ogni entità introdotta;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.
