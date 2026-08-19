# Phase F — Spazi condivisi

> Stato: **non attiva**. Dipende da B. Introduce `SpaceScope` e con esso il
> cambiamento più invasivo della roadmap: fino a qui ogni dato è privato per
> costruzione. Piano di fase, non autorizzazione: si implementa solo ciò che
> [CURRENT_MILESTONE](../CURRENT_MILESTONE.md) attiva.

## Sintesi

| Slice   | Outcome                                                                |
| ------- | ---------------------------------------------------------------------- |
| **G-F** | role matrix, lifecycle degli inviti e regola dell'ultimo owner firmati |
| **F1**  | una sola vertical slice condivisa (lista **oppure** evento)            |
| **F2**  | calendario familiare e attività assegnate                              |
| **F3**  | spese condivise, split e debiti registrati                             |

Tre cose da capire prima di aprire un file di codice:

1. **`SpaceScope` non sostituisce `UserScope`: convive.** Un'entità privata ha
   un owner e nessuno spazio; un'entità condivisa ha uno spazio. Nessun dato
   esistente viene migrato implicitamente — quello che l'utente ha creato in B
   resta privato per sempre, salvo un'azione esplicita.
2. **L'authorizer smette di essere una funzione pura.** Oggi
   `SelfScopeAuthorizer` confronta due stringhe. Con gli spazi
   l'autorizzazione richiede membership e ruolo, cioè una lettura dal database:
   diventa asincrona e I/O-bound. Va risolta una volta per richiesta e passata
   in giù, non richiesta a ogni repository — altrimenti una vista condivisa
   moltiplica le query di autorizzazione per il numero di entità.
3. **Il test che conta più di tutti** non è "il membro vede i dati dello
   spazio": è **"entrare in uno spazio non rende visibile nulla di ciò che era
   privato"**, né prima né dopo. Un leak retroattivo qui è un P0 che distrugge
   la fiducia nel prodotto.

---

## G-F — Gate d'ingresso: decisioni del proprietario

Già registrate come aperte nel [decision register](../MASTER_ACTION_PLAN.md)
sotto "Sharing/delete". Qui sono spacchettate.

- [ ] **Role matrix.** Quali ruoli esistono (owner, membro, sola lettura?) e
      quale capability ha ciascuno su ogni tipo di risorsa condivisa. È la
      decisione che condiziona tutto il resto: farla dopo F1 significa rifarlo.
- [ ] **Lifecycle dell'invito.** TTL, uso singolo, binding al destinatario o al
      solo spazio, revocabilità, cosa succede se il destinatario non ha ancora
      un account.
- [ ] **Ultimo owner.** Un owner non può uscire se è l'ultimo: deve promuovere
      qualcuno o eliminare lo spazio. Decidere quale delle due, e cosa accade
      alle risorse alla eliminazione.
- [ ] **Da privato a condiviso.** Se un'entità privata può diventare condivisa,
      e con quale conferma. Raccomandazione: **sì, ma solo esplicitamente e una
      entità per volta**; nessuna conversione bulk in F.
- [ ] **Trattamento dei dati condivisi alla cancellazione dell'account.** Un
      membro che cancella il proprio account lascia spese e attività che
      riguardano altri: definire cosa resta, cosa viene anonimizzato e cosa
      sparisce. Si collega direttamente a I2 e va deciso qui, non lì.

---

## Sequenza

### F1 — Prima slice condivisa

Una sola entità, scelta fra lista ed evento. Serve a far emergere il costo reale
di `SpaceScope` su un caso piccolo, prima di replicarlo.

- spazi, membership, inviti e ruoli modellati in un ADR **prima** del codice;
- inviti one-time, expiring, revocabili, con lo stesso pattern di sessione
  opaca già usato dall'OAuth di [C2.1](c-ai-byok.md#c21--router-http-e-sessione-oauth):
  non se ne inventa un secondo;
- ogni repository condiviso riceve `SpaceScope { userId, spaceId }` esplicito;
- membership, ruolo e appartenenza della risorsa verificati a ogni read e write:
  tre controlli distinti, non uno che ne implica altri due;
- ogni messaggio dice sempre se l'azione è privata o condivisa — l'ambiguità qui
  è un difetto di prodotto, non di UI;
- l'audit registra **l'attore reale**, non lo spazio;
- indici su membership e spazio, con `EXPLAIN QUERY PLAN` sugli hot path.

### F2 — Calendario familiare e attività assegnate

Estende il modello di F1 a eventi condivisi e ad attività assegnate a un membro.
L'assegnazione è un riferimento tipizzato e scoped, non un campo di testo.

### F3 — Spese condivise e split

- importi e split in minor unit intere, con somma **esattamente** conservata e
  arrotondamento deterministico (invariante 8 e Definition of Done);
- debiti e crediti sono registrazioni, non movimenti: Tessavio non muove denaro
  ([ADR-0009](../../decisions/0009-no-open-banking.md));
- preview obbligatoria per azioni bulk o che toccano il saldo di altri membri.

---

## Rischi e mitigazioni

| Rischio                                                | Mitigazione                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Dato privato visibile dopo l'ingresso in uno spazio    | nessuna migrazione implicita; test di non-visibilità in entrambi i versi |
| Authorization moltiplicata per entità in una vista     | membership e ruolo risolti una volta per richiesta e passati in giù      |
| Role matrix decisa dopo la prima slice                 | G-F blocca F1                                                            |
| Invito riusato, forgiato o di un altro utente          | one-time, user-bound, TTL, consumo atomico; test dedicati                |
| Ultimo owner che esce e lascia risorse orfane          | regola decisa in G-F e applicata dal dominio, non dalla UI               |
| Downgrade di ruolo non applicato a operazioni in corso | il ruolo si verifica al momento della write, non della lettura           |
| Query condivise senza indice su membership             | `EXPLAIN QUERY PLAN` obbligatorio prima della chiusura                   |
| Split che non somma all'importo                        | property test sull'arrotondamento                                        |

---

## Criteri di uscita della Phase F

- [ ] nessun dato privato diventa visibile per effetto di una membership;
- [ ] membership, ruolo e scope della risorsa sono verificati separatamente a
      ogni accesso, con test negativo per ciascuno;
- [ ] invito riusato, forgiato, scaduto o di un altro utente sono tutti negati;
- [ ] leave, revoke, ultimo owner, delete space e risorse orfane hanno un
      comportamento definito e testato;
- [ ] ogni messaggio distingue privato e condiviso;
- [ ] split e saldi conservano la somma esatta in minor unit;
- [ ] migration F validata fresh, upgrade e worker N-1 su schema N;
- [ ] review security chiusa senza finding P0/P1;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.

## Agent route

`architect` congela role matrix e lifecycle degli inviti **prima** di F1.
`domain_worker` è il writer di ogni slice; `cloudflare_worker` interviene solo
sulla presentazione Telegram. `data_security_reviewer` chiude ogni slice: in
questa fase la review di sicurezza non è opzionale né rimandabile a fine fase.
