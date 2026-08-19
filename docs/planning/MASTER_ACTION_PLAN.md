# Master action plan — dalla baseline al prodotto Tessavio

## Scopo e stato

Questo documento è la mappa operativa end-to-end del repository. Traduce la
[roadmap](ROADMAP.md) in una sequenza verificabile, descrive il valore percepito
dall'utente e indica al main agent come assegnare lavoro bounded agli agenti di
coding e review.

Stato verificato il 2026-08-19:

- [x] A0 documentale: visione, architettura, ADR, policy e profili agente;
- [x] A1 Foundation: webhook, Queue, identità, idempotenza, audit, `npm run validate` verde;
- [x] B1-B7 Core deterministico chiuso, gate trasversali inclusi
      ([ADR-0021](../decisions/0021-phase-b-closure.md));
- [x] requisiti di prodotto estesi assegnati a milestone concrete A-O;
- [ ] C1 `ActionProposal` attivata (richiede aggiornamento esplicito di
      [CURRENT_MILESTONE.md](CURRENT_MILESTONE.md));
- [ ] release beta chiusa secondo [RELEASE_CLOSURE.md](RELEASE_CLOSURE.md).

Nessuna risorsa Cloudflare remota è stata creata; non esiste deploy pubblico.

La sola milestone autorizzata all'implementazione è sempre quella indicata in
[CURRENT_MILESTONE.md](CURRENT_MILESTONE.md). Le fasi future sono
impegni di prodotto ordinati: definiscono outcome, UX, rischi e gate, ma non autorizzano
scaffold, dipendenze o API premature. Quando una fase diventa attiva, il main
agent deve sostituire la milestone corrente con un piano esecutivo della sola
vertical slice successiva.

## Cosa significa “chiusura”

Il repository è chiuso per la beta quando il prodotto copre tutte le fasi rese
obbligatorie dallo scope beta approvato, tutti i
gate applicabili della [Definition of Done](DEFINITION_OF_DONE.md) sono verdi, la
release è riproducibile, la recovery è provata e ciò che non entra nella beta è
esplicitamente spostato nel backlog futuro. Il deploy o la creazione di risorse
remote richiedono comunque autorizzazione esplicita del proprietario.

La chiusura della core beta non cancella le milestone J-N già approvate: indica
solo che il relativo release gate è verificato. La chiusura del prodotto esteso
arriva con O. In entrambi i casi non devono restare attività implicite, rischi
critici non accettati o criteri di uscita non verificati nello scope dichiarato.

La chiusura non significa che il software non riceverà manutenzione.

## Decision register del main agent

Queste decisioni non vanno lasciate a un writer. Il main agent raccoglie
evidenze, propone la scelta al proprietario quando cambia prodotto/scope e
registra in ADR le conseguenze durevoli.

- [x] **Source control:** inizializzato Git `main` e collegato il remote
      corretto prima delle implementazioni; non inventare destinazione o history.
- [x] **Delivery semantics:** adottato trasporto
      at-least-once con una sola esecuzione logica tramite chiavi stabili,
      inbox/effect ledger e recovery; non promettere Queue/Telegram exactly-once
      ([ADR-0007](../decisions/0007-at-least-once-logical-idempotency.md)).
- [x] **Comando A1:** usare `/start`, così la Foundation prova identità e
      authorization senza trascinare timezone/Temporal dentro la slice.
- [x] **Posizione A2:** fondere la reminder infrastructure nella
      prima vertical slice reminder della Phase B, senza uno scaffold orizzontale.
- [x] **Scope di prodotto:** Inbox, finanze, briefing, documenti, persone, casa,
      planner, Google Calendar, viaggi e benessere sono assegnati a milestone
      concrete; la core beta termina in I e il prodotto esteso in O.
- [x] **Open Banking:** escluso definitivamente con ADR-0009; CSV solo manuale.
- [x] **Inbox/confini:** acquisizione comune senza duplicare i domini (ADR-0010).
- [x] **Google Calendar:** H1 export, H2 reconcile/import e H3 bidirezionale,
      sempre con D1 autorevole (ADR-0011).
- [x] **Retention A1:** fissate durate e recovery per inbox/dedupe,
      job/effect/delivery ledger, audit e identità in ADR-0008.
- [ ] **Retention futura:** fissare durate e purge per ActionProposal, media,
      Undo/soft-delete, OAuth state, log, export e backup.
- [ ] **OAuth/crypto:** prima di C approvare TTL, redirect allowlist, binding,
      consumo atomico, ciphertext format/AAD, KEK rotation e revoca.
- [ ] **Sharing/delete:** prima di F/I approvare role matrix, ultimo owner,
      private-to-shared e trattamento di dati condivisi, audit e backup alla delete.
- [ ] **Go/no-go:** prima di I3 approvare SLO, carico, RPO/RTO, autorità di firma e
      regola sui finding residui.

## Invarianti che ogni checkbox deve preservare

- [ ] il flusso core continua a funzionare in modalità `NO_AI`;
- [ ] ogni accesso tenant-scoped riceve `UserScope` o `SpaceScope` esplicito;
- [ ] Telegram `user_id` viene risolto in un ID interno prima del dominio;
- [ ] l'AI può produrre solo `ActionProposal[]`, mai autorizzare o scrivere;
- [ ] ogni write è autorizzata, idempotente, auditabile e, se reversibile, annullabile;
- [ ] timestamp, date locali e timezone IANA conservano la semantica temporale;
- [ ] il denaro usa unità minori intere e valuta esplicita;
- [ ] webhook, Queue e Cron mantengono correlation ID e confini di retry;
- [ ] log, fixture e benchmark non contengono segreti, prompt completi o dati personali;
- [ ] media raw e credenziali rispettano retention, cancellazione e cifratura definite;
- [ ] ogni nuova categoria persistita definisce retention, purge idempotente,
      isolamento tenant, legal hold applicabile e comportamento di backup/restore;
- [ ] nessuna dipendenza usa `latest` o range aperti e ogni API mutevole viene riverificata;
- [ ] nessuna fase introduce microservizi o Workflow senza evidenza misurata;
- [ ] il sync bidirezionale esiste solo nel gate H3 con conflict policy e loop prevention;
- [ ] nessun secret, provider, adapter, schema o dipendenza Open Banking.

## Flusso utente di destinazione

Questa è la storia che le vertical slice devono costruire senza salti.

1. **Primo contatto.** L'utente sceglie lingua/timezone e comprende modalità
   `NO_AI`, dati trattati e comandi disponibili.
2. **Core deterministico.** Eventi, task, reminder, turni, liste e finanze base
   funzionano con comandi, authorization, audit e Undo.
3. **Tessavio Inbox.** Testo, forward e link diventano comandi o proposte verso i
   domini; un input ambiguo genera una sola domanda mirata.
4. **Voce, immagini e documenti.** I media sono elaborati in modo transitorio e
   import multipli/incerti richiedono revisione.
5. **Planner.** Slot e riprogrammazioni sono calcolati deterministicamente,
   motivati e applicati solo dopo la policy prevista.
6. **Condivisione.** Membership e ruoli rendono esplicito cosa è privato o
   familiare/condiviso.
7. **Proattività.** Briefing configurabili rispettano quiet hours e dedupe e si
   arricchiscono solo dopo l'arrivo dei relativi domini.
8. **Calendario esterno.** Google Calendar passa da export a riconciliazione e
   sync bidirezionale controllata; D1 resta autorevole.
9. **Controllo e diritti.** Mini App, export, revoca e delete account usano
   sessioni brevi e purge verificabile.
10. **Memoria personale.** Documenti, persone e follow-up sono ricercabili e
    collegati senza duplicare eventi, task o finanze.
11. **Vita domestica e viaggi.** Casa, pasti e viaggi funzionano localmente prima
    delle integrazioni esterne.
12. **Benessere prudente.** Routine e reminder personali non diventano diagnosi,
    prescrizioni o trattamenti.

### Contratto UX comune

Ogni feature deve specificare e testare:

- [ ] testo iniziale che dica all'utente cosa è successo o cosa serve;
- [ ] riepilogo delle entità coinvolte, con data/ora locale e scope privato/condiviso;
- [ ] assunzioni e ambiguità visibili, senza inventare campi mancanti;
- [ ] `Conferma`, `Modifica` e `Annulla` per preview; `Annulla modifica` per write reversibili;
- [ ] token/callback brevi, scaduti in modo sicuro e legati a utente, scope e proposta;
- [ ] esito utile per errori temporanei, permanenti, duplicati e autorizzazione negata;
- [ ] fallback a comandi deterministici quando l'AI o un'integrazione è indisponibile;
- [ ] nessuna esposizione di stack trace, ID sensibili, token o contenuto di altri tenant.

## Metodo di orchestrazione

Spostato in [docs/agents/ORCHESTRATION.md](../agents/ORCHESTRATION.md) (loop di
task, scelta dell'agente, routing dei modelli, protocollo di chiusura fase e
prompt base). Non duplicarlo qui.

## Piani di fase

I piani esecutivi vivono in [phases/](phases/README.md), un file per fase.
Aprire soltanto quello della milestone attiva.

| Fase                  | File                                                | Stato      |
| --------------------- | --------------------------------------------------- | ---------- |
| A Foundation          | [a-foundation.md](phases/a-foundation.md)           | completata |
| B Core deterministico | [b-core.md](phases/b-core.md)                       | completata |
| C AI + BYOK           | [c-ai-byok.md](phases/c-ai-byok.md)                 | non attiva |
| D Voce e vision       | [d-media.md](phases/d-media.md)                     | non attiva |
| E Planner             | [e-planner.md](phases/e-planner.md)                 | non attiva |
| F Sharing             | [f-sharing.md](phases/f-sharing.md)                 | non attiva |
| G Proattività         | [g-proactive.md](phases/g-proactive.md)             | non attiva |
| H Google Calendar     | [h-google-calendar.md](phases/h-google-calendar.md) | non attiva |
| I Mini App e beta     | [i-beta.md](phases/i-beta.md)                       | non attiva |
| J Documenti e persone | [j-documenti.md](phases/j-documenti.md)             | non attiva |
| K Finanze avanzate    | [k-finanze.md](phases/k-finanze.md)                 | non attiva |
| L Casa e pasti        | [l-casa.md](phases/l-casa.md)                       | non attiva |
| M Viaggi              | [m-viaggi.md](phases/m-viaggi.md)                   | non attiva |
| N Routine e benessere | [n-benessere.md](phases/n-benessere.md)             | non attiva |
| O Convergenza         | [o-convergenza.md](phases/o-convergenza.md)         | non attiva |

## Chiusura del repository

Checklist di release e matrice minima di evidenze:
[RELEASE_CLOSURE.md](RELEASE_CLOSURE.md).
