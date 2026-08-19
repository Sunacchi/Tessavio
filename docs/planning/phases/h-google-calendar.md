# Phase H — Google Calendar a livelli

> Stato: **non attiva**. Dipende da B (eventi) e dal router HTTP pubblico
> introdotto in [C2.1](c-ai-byok.md#c21--router-http-e-sessione-oauth). Livelli
> fissati da [ADR-0011](../../decisions/0011-google-calendar-sync-levels.md).
> Piano di fase, non autorizzazione.

## Sintesi

| Slice   | Outcome                                                        | Gate         |
| ------- | -------------------------------------------------------------- | ------------ |
| **G-H** | scope OAuth, calendario di destinazione e host pubblico decisi | —            |
| **H1**  | collegamento account ed **export controllato**: D1 → Google    | G-H          |
| **H2**  | riconciliazione e import: Google → staging validato            | H1 stabile   |
| **H3**  | sincronizzazione bidirezionale con policy di conflitto         | H2 + G-H bis |

Tre cose che cambiano il modo di progettare questa fase:

1. **Le notifiche push di Google non contengono dati.** Il callback riceve solo
   degli header e un `X-Goog-Resource-State`: nessun corpo, nessun evento. La
   conseguenza è ottima per la sicurezza — non c'è payload da falsificare, e il
   peggio che un attaccante ottiene inviando un callback finto è farci
   sincronizzare, che è idempotente. La verità si legge sempre richiamando
   l'API, mai dalla notifica.
2. **`X-Goog-Channel-Token` è l'unica autenticazione del callback.** È un valore
   opaco che scegliamo noi alla creazione del canale: va generato casuale per
   canale, conservato accanto al canale e confrontato in tempo costante. Senza
   quello l'endpoint è una porta aperta.
3. **I canali non si rinnovano da soli.** Scadono, e Google non offre alcun
   rinnovo automatico: bisogna crearne uno nuovo **prima** della scadenza,
   accettando un periodo in cui entrambi sono attivi e consegnano lo stesso
   evento due volte. Il dedupe non è un extra, è il presupposto.

---

## G-H — Gate d'ingresso: decisioni del proprietario

- [ ] **Host pubblico con certificato valido.** Google consegna le notifiche
      solo verso HTTPS con certificato valido: niente self-signed, niente
      hostname non corrispondente. È lo stesso problema già aperto in
      [G0.2 di C](c-ai-byok.md#g02--prima-di-c2-nessuna-eccezione): va risolto
      una volta per entrambe le fasi.
- [ ] **Scope OAuth minimi.** Il più stretto che permette H1; ampliare per H2 e
      H3 con un nuovo consenso, non chiedere tutto subito.
- [ ] **Calendario di destinazione.** Un calendario dedicato creato da Tessavio
      oppure uno scelto dall'utente. Raccomandazione: **dedicato**, perché rende
      l'export reversibile (si elimina il calendario) e non inquina l'agenda
      esistente dell'utente.
- [ ] **Prima di H3:** policy di conflitto per campo, quali casi si risolvono da
      soli e quali richiedono conferma. H3 non si apre senza questa decisione.

---

## Sequenza

### H1 — Collegamento ed export controllato

- D1 resta autorevole; mapping stabile fra ID locale ed esterno, sempre scoped
  per tenant, account e calendario;
- token cifrati e versionati con lo stesso envelope di
  [C2.2](c-ai-byok.md#c22--envelope-encryption-delle-credenziali), non con un
  secondo meccanismo; revoca e disconnessione rimuovono il segreto e fermano i job;
- l'outbox si registra **nello stesso boundary** della mutation locale e si
  applica **fuori** dalla transazione: è ciò che rende l'export ritentabile
  senza tenere aperta una transazione su una chiamata di rete;
- create, update e delete idempotenti verso Google;
- stato visibile all'utente: `pending`, `exported`, `failed`;
- retry e failure permanenti classificati distintamente; 429 e batch parziali
  gestiti;
- tutto testato con adapter fake: **nessuna credenziale reale nei test**.

**Criterio di chiusura H1:** un'interruzione di Google non blocca né corrompe il
core. L'utente continua a usare gli eventi come se l'integrazione non ci fosse.

### H2 — Riconciliazione e import

- sync incrementale con `syncToken`: si ottiene dal `nextSyncToken` della prima
  sincronizzazione completa e si conserva;
- **su HTTP 410 il token è morto**: la recovery prevista è azzerare lo stato
  locale di sincronizzazione ed eseguire una sincronizzazione completa. Non è un
  caso raro da gestire "poi": è il percorso normale dopo un'inattività o un
  cambio di ACL;
- i parametri di query devono restare **identici** fra sincronizzazioni
  incrementali: cambiarli invalida il token. Vanno quindi fissati in
  configurazione versionata, non passati caso per caso;
- i risultati incrementali includono sempre le voci cancellate: il tombstone
  locale è obbligatorio;
- ciclo di vita dei canali push: creazione con token opaco, rinnovo anticipato
  con nuovo ID, periodo di sovrapposizione, dedupe;
- timezone, eventi all-day e ricorrenze mappati senza perdita semantica;
- **un cambiamento esterno diventa una proposta validata in staging**, non una
  sovrascrittura automatica;
- riconciliazione completa bounded quando il cursore è perso o il mapping diverge.

### H3 — Sincronizzazione bidirezionale

- policy di conflitto per versione e per campo, con distinzione esplicita fra
  auto-merge e conferma;
- le modifiche importate passano da authorization, idempotenza, servizio di
  dominio, audit e Undo dove applicabile: non esiste una scorciatoia per i dati
  che arrivano da Google;
- prevenzione dei loop con origine, versione e chiave di effetto stabili — senza
  questo, ogni export genera un import che genera un export;
- i conflitti si mostrano all'utente senza esporre dettagli nei log.

---

## Rischi e mitigazioni

| Rischio                                                   | Mitigazione                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| Callback pubblico non autenticato                         | `X-Goog-Channel-Token` opaco per canale, confronto costante     |
| Canale scaduto senza rinnovo → sync silenziosamente morto | rinnovo anticipato programmato e monitor sull'assenza di eventi |
| Doppia consegna nel periodo di sovrapposizione            | dedupe per risorsa e versione                                   |
| `syncToken` invalidato (410) trattato come errore raro    | recovery a sincronizzazione completa come percorso previsto     |
| Parametri di query cambiati che invalidano il token       | parametri in configurazione versionata, non per chiamata        |
| Loop echo export → import → export                        | origine, versione e chiave di effetto stabili                   |
| Outage Google che blocca il core                          | outbox asincrona; criterio di chiusura H1                       |
| Ricorrenze e all-day mappati male                         | test dedicati su ricorrenze, all-day e timezone                 |
| Token Google trattati diversamente da quelli OpenRouter   | stesso envelope di cifratura, nessun secondo meccanismo         |

---

## Criteri di uscita della Phase H

- [ ] un outage o una revoca Google non bloccano né corrompono il dominio locale;
- [ ] mapping e cursori sono sempre scoped per tenant, account e calendario;
- [ ] riconciliazione e conflitti non usano mai last-write-wins cieco;
- [ ] i loop echo sono impossibili per costruzione e provati;
- [ ] revoca e disconnessione fermano i nuovi job e rimuovono le credenziali;
- [ ] callback forgiato, riusato o di un altro canale sono negati;
- [ ] ogni migration H validata fresh, upgrade e worker N-1 su schema N;
- [ ] runbook di riconciliazione scritto e provato;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni livello.

## Agent route

`architect` congela mapping, idempotenza e policy di conflitto prima di ogni
livello. `ai_integrations_worker` non ha ruolo qui: il writer dell'adapter è
`cloudflare_worker`, quello delle regole `domain_worker`.
`data_security_reviewer` chiude OAuth, cifratura dei token e superficie del
callback.

## Appendice — Fatti esterni verificati

Verificati il **2026-08-19**, da riverificare all'inizio di H.

**Sincronizzazione incrementale**

- `nextSyncToken` arriva con la prima sincronizzazione completa e va conservato;
- passandolo come `syncToken` si ottengono solo le modifiche, **incluse le
  cancellazioni**;
- **HTTP 410** significa token non più valido (scadenza o cambio ACL): la
  recovery documentata è azzerare lo store locale e rifare la sincronizzazione
  completa;
- l'insieme dei parametri di query utilizzabili in incrementale è ristretto e
  deve restare coerente fra le richieste.

**Canali push**

- richiedono un endpoint HTTPS con certificato valido (no self-signed, no
  hostname non corrispondente);
- **nessun rinnovo automatico**: si crea un canale nuovo con ID diverso prima
  della scadenza, con periodo di sovrapposizione;
- header inviati: `X-Goog-Channel-ID`, `X-Goog-Message-Number`,
  `X-Goog-Resource-ID`, `X-Goog-Resource-State` (`sync` / `exists` /
  `not_exists`), `X-Goog-Resource-URI`, `X-Goog-Channel-Expiration`,
  `X-Goog-Channel-Token`;
- **le notifiche non hanno corpo**: i dettagli si recuperano richiamando l'API.
