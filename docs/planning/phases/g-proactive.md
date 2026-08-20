# Phase G — Briefing e assistenza proattiva

> Stato: **non attiva**. **G1 e G2 dipendono solo da B**: compongono i domini
> deterministici già chiusi e non richiedono né il planner né gli spazi. Solo
> G3 definisce il contratto per i domini estesi. Piano di fase, non
> autorizzazione: si implementa solo ciò che [CURRENT_MILESTONE](../CURRENT_MILESTONE.md)
> attiva.

## Sintesi

| Slice   | Outcome                                                        | Dipende da |
| ------- | -------------------------------------------------------------- | ---------- |
| **G-G** | tono, contenuto e finestra di freschezza decisi                | —          |
| **G1**  | briefing mattutino e riepilogo serale opt-in sui domini B      | B          |
| **G2**  | riepiloghi settimanali e mensili sugli stessi domini           | G1         |
| **G3**  | contratto bounded e tipizzato dei contributor, senza attivarli | G1         |

Tre cose da fissare prima del codice:

1. **La dipendenza dichiarata era troppo larga.** G1 usa eventi, task, reminder
   e turni: tutta roba chiusa in Phase B. Aspettare E ed F significa rimandare
   senza motivo il primo valore proattivo del prodotto.
2. **Terzo consumatore della stessa composizione.** Dopo `/oggi` e il planner,
   il briefing compone gli stessi domini: se a questo punto la composizione non
   è dietro porte autorizzate e riusabili, il problema è la composizione, non il
   briefing.
3. **Un briefing in ritardo è peggio di un briefing mancato.** Il riepilogo
   della giornata consegnato a metà pomeriggio è rumore, e insegna all'utente a
   ignorare le notifiche. Serve una **finestra di freschezza**: fuori da quella,
   si salta e si registra il salto, non si consegna comunque.

---

## G-G — Gate d'ingresso: decisioni del proprietario

- [ ] **Finestra di freschezza.** Quanti minuti dopo l'orario previsto un
      briefing è ancora utile. È la decisione che rende il ritardo un caso
      gestito invece che un difetto.
- [ ] **Contenuto di default e tono.** Cosa entra nel briefing mattutino senza
      configurazione, e cosa non deve entrarci mai. Il tono è conciso e non
      ansiogeno: un elenco di scadenze arretrate presentato male è una fonte di
      stress quotidiana, non un servizio.
- [ ] **Livello di dettaglio sensibile.** Un briefing arriva su una notifica del
      telefono, potenzialmente visibile sulla schermata di blocco: decidere cosa
      viene riassunto e cosa richiede di aprire la chat.
- [ ] **Serale opt-in.** Confermare che il riepilogo serale è separato dal
      mattutino e disattivato per default.

---

## Sequenza

### G1 — Briefing mattutino e riepilogo serale

- preferenze di contenuto, orario e frequenza, con quiet hours già esistenti
  rispettate senza eccezioni;
- composizione di eventi, task, scadenze, turni e reminder **attraverso porte
  applicative autorizzate**, mai con query cross-domain libere;
- il riepilogo serale è opt-in e separato: chi vuole solo il mattino non riceve
  due notifiche;
- schedule, claim atomico e delivery dedupe producono **una sola notifica
  logica** anche sotto retry di Cron e Queue — è l'infrastruttura di B2, non una
  nuova;
- una preferenza cambiata mentre un invio è in corso non produce né doppio invio
  né invio con le impostazioni vecchie senza che l'utente lo sappia;
- fuori dalla finestra di freschezza l'invio viene saltato e registrato.

### G2 — Riepiloghi settimanali e mensili

Stessi domini di G1, periodo diverso. **Non** richiede spese programmate,
forecast o le capability di K: se un dato non esiste ancora, non compare, e il
briefing non lo simula.

### G3 — Contratto dei contributor

Definisce **soltanto** l'interfaccia con cui un dominio futuro contribuisce al
briefing: input tipizzato, scope, timeout, isolamento e degradazione. Non
attiva, non anticipa e non scaffolda documenti, persone, casa, viaggi o
benessere. È il seam che permette a O di accendere i contributor J-N senza
riaprire G.

**Regola di degradazione:** un contributor che fallisce o va in timeout viene
omesso con una riga esplicita; non blocca il briefing e non lo duplica. Il
delivery ledger registra il successo parziale come tale.

---

## Rischi e mitigazioni

| Rischio                                             | Mitigazione                                                     |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Doppia consegna sotto retry Cron/Queue              | claim atomico e delivery dedupe già provati in B2               |
| Briefing consegnato tardi e inutile                 | finestra di freschezza: salta e registra                        |
| Un contributor lento blocca l'intero invio          | timeout e isolamento per contributor, omissione esplicita       |
| Quiet hours violate al cambio ora                   | orario locale con timezone IANA; test DST sul giorno del cambio |
| Preferenza cambiata durante l'invio                 | lettura delle preferenze dentro il boundary dell'invio          |
| Dato sensibile in anteprima di notifica             | livello di dettaglio deciso in G-G, non lasciato al default     |
| Query cross-domain libere per comporre il riepilogo | composizione solo attraverso porte autorizzate                  |
| G3 che diventa scaffold delle fasi J-N              | G3 definisce l'interfaccia e nient'altro                        |

---

## Criteri di uscita della Phase G

- [ ] una sola notifica logica per briefing, provata sotto retry e duplicate
      delivery di Cron e Queue;
- [ ] quiet hours e preferenze rispettate, compreso il giorno del cambio ora;
- [ ] un contributor che fallisce degrada senza bloccare né duplicare;
- [ ] nessuna query cross-domain libera: solo porte autorizzate;
- [ ] nessun dato di un altro utente compare in un briefing, provato con test
      cross-tenant;
- [ ] opt-out immediato e verificato;
- [ ] retention dei delivery snapshot definita e provata con fake clock;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.

## Agent route

Il main agent possiede il contratto dei contributor, la policy di quiet hours e
il tono. `domain_worker` implementa composizione e query; `cloudflare_worker`
Cron, Queue e delivery. `quality_reviewer` verifica ripetizioni, degradazione e
casi DST; una review dedicata al **contenuto** dei messaggi vale quanto quella
al codice: qui il difetto tipico non è un'eccezione, è una frase sbagliata
consegnata ogni mattina.
