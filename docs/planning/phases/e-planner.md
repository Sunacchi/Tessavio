# Phase E — Pianificazione deterministica

> Stato: **non attiva**. **E1 dipende solo da B**, non da C: l'allocatore è
> codice deterministico e non chiama alcun modello. Solo E2 (vincoli espressi a
> parole) richiede C1. Questo è il piano esecutivo, non un'autorizzazione: si
> implementa solo ciò che [CURRENT_MILESTONE](../CURRENT_MILESTONE.md) attiva.

## Sintesi

"Pianificami la settimana" restituisce un piano revisionabile costruito dal
codice. Se i vincoli non stanno nel tempo disponibile, il sistema dice **cosa
resta fuori e perché**, e non forza uno slot.

| Slice   | Outcome                                                             | Dipende da |
| ------- | ------------------------------------------------------------------- | ---------- |
| **G-E** | decisioni del proprietario congelate                                | —          |
| **E1**  | motore deterministico: vista, conflitti, allocazione, preview/apply | B          |
| **E2**  | vincoli espressi a parole normalizzati in input del motore          | E1 + C1    |
| **E3**  | riprogrammazione di ciò che non è stato completato                  | E1         |

Le tre idee che reggono il piano:

1. **E1 non è bloccata da C.** Il testo corrente del piano dichiarava una
   dipendenza da C per la "normalizzazione dei vincoli", ma il motore riceve
   input già strutturati da comandi espliciti: può essere costruito, testato e
   chiuso senza alcun provider. È l'unica fase pianificata che può procedere in
   parallelo a C invece che dopo.
2. **Stabilità prima di ottimalità.** Un piano leggermente subottimale ma
   stabile è più utile di uno ottimo che si riorganizza a ogni ricalcolo. La
   funzione obiettivo è la spiegabilità: se l'utente non capisce perché una cosa
   è finita lì, il piano non serve.
3. **La composizione cross-domain esiste già.** `/oggi` compone eventi, task,
   reminder e turni con authorization separata per contributor: è un gate
   trasversale già chiuso in Phase B. Il planner **riusa quella composizione**
   e non ne crea una seconda — altrimenti nasce il terzo aggregatore che
   [ADR-0022](../../decisions/0022-module-structure-budgets.md) vieta.

---

## G-E — Gate d'ingresso: decisioni del proprietario

- [ ] **Cosa è vincolo rigido.** Turni pianificati, eventi con orario, sonno e
      quiet hours sono `hard`; preferenze di orario e raggruppamento sono `soft`.
      Un piano che viola un `hard` **non esiste**: si dichiara impossibile.
      Questa classificazione è di prodotto, non di implementazione.
- [ ] **Limite di carico giornaliero.** Ore massime allocabili in un giorno e
      pausa minima fra blocchi. Senza un tetto, il planner produce piani
      disumani che l'utente non seguirà — e la fiducia si perde una volta sola.
- [ ] **Cosa fa il planner con la durata mancante.** Chiedere sempre, oppure
      proporre un'assunzione revisionabile. Raccomandazione: **assunzione
      esplicita e visibile** in preview, perché chiedere a ogni task rende
      inutilizzabile la pianificazione di una settimana.
- [ ] **Perimetro dell'apply.** Se il planner può creare eventi oltre che
      spostare task, e se può toccare entità condivise (rimandato a dopo F).
      Raccomandazione: in E1 il planner **non tocca entità condivise**.
- [ ] **Semantica dello scadere.** Cosa succede a un blocco pianificato che
      l'utente non completa: resta, scade, o si ripropone in E3.

---

## E1 — Motore deterministico

**Outcome.** Da un insieme di impegni e task con durata, il codice produce un
piano che l'utente vede prima che qualcosa cambi.

### Contratto da congelare in ADR

**Input normalizzato** — è il confine del motore, e ciò che rende E1
indipendente da C:

```
finestra          (inizio, fine, timezone IANA)
impegni fissi     [{ inizio, fine, origine: evento|turno|reminder }]
da allocare       [{ id, durata, priorità, scadenza?, precedenze[] }]
disponibilità     [{ giorno, fasce }]
preferenze        soft, con peso esplicito
limiti            carico giornaliero, pausa minima
```

**Output tripartito.** Il motore non restituisce "un piano": restituisce uno di
tre esiti, e ognuno è un caso di prima classe.

| Esito         | Significato                                | Cosa mostra                                     |
| ------------- | ------------------------------------------ | ----------------------------------------------- |
| `completo`    | tutto allocato rispettando gli `hard`      | il piano e le assunzioni fatte                  |
| `parziale`    | parte allocata, il resto no                | **cosa resta fuori e quale vincolo lo esclude** |
| `impossibile` | nemmeno un vincolo `hard` è soddisfacibile | quale coppia di vincoli è in conflitto          |

Un esito `parziale` presentato come completo è il difetto peggiore di un
planner: l'utente scopre a cose fatte che qualcosa non c'era.

**Algoritmo — decisione richiesta ad `architect`.** Raccomandazione: **greedy
deterministico** con ordinamento esplicito (scadenza, poi priorità, poi ID come
tie-break totale) e un numero massimo di tentativi di riposizionamento. Niente
ottimizzazione globale: costa, non è spiegabile e produce riorganizzazioni
ampie a ogni ricalcolo. Se il benchmark di constraint-compliance mostra che il
greedy lascia fuori troppo, la valutazione di un backtracking **bounded** è una
decisione successiva con dati alla mano.

**Determinismo dimostrabile.** A parità di input, clock e configurazione,
l'output è identico byte per byte. Questo vieta: ordinamenti che dipendono
dall'ordine di iterazione di una mappa, tie-break su UUID generati al volo,
qualsiasi lettura di orologio dentro l'allocatore. Il clock è iniettato, come
in tutto il resto del repository.

**Tempo civile, non aritmetica.** Le finestre si esprimono in `ZonedDateTime`
Temporal: una finestra che attraversa il cambio d'ora ha durata civile diversa
da quella assoluta, e il motore deve usare quella civile. È l'invariante 7
applicato a un dominio nuovo, non un'eccezione.

**Preview e apply.** Il piano viene persistito come proposta con la **versione
di ogni entità letta**; l'apply verifica che nessuna sia cambiata e altrimenti
rifiuta con stale-version, esattamente come il version check già usato da Undo e
da B6.2. Fra preview e apply può passare tempo e l'utente può aver modificato
un'agenda da un altro dispositivo.

**Undo di un piano.** Applicare un piano tocca N entità: l'Undo deve essere
**un solo token per l'intero piano**, non N token. Nuova categoria di Undo,
registrata nel registry di C0 con il suo prefisso, con la stessa semantica
single-use, user-bound e con TTL delle categorie B.

### Test obbligatori E1

| Test                | Deve provare                                                        |
| ------------------- | ------------------------------------------------------------------- |
| property overlap    | nessun blocco allocato si sovrappone a un impegno `hard`            |
| property finestre   | nessun blocco cade fuori dalla disponibilità dichiarata             |
| property precedenze | l'ordine richiesto è rispettato in ogni piano prodotto              |
| property durata     | la somma dei blocchi di un task è esattamente la durata richiesta   |
| DST                 | finestra che attraversa il cambio ora: durata civile, non assoluta  |
| determinismo        | dieci esecuzioni con stesso input e clock → output identico         |
| esito parziale      | vincoli insoddisfacibili → `parziale` con motivazione, mai silenzio |
| esito impossibile   | vincoli hard in conflitto → coppia in conflitto nominata            |
| carico              | il tetto giornaliero non viene mai superato                         |
| stale version       | entità modificata fra preview e apply → apply rifiutato             |
| apply idempotente   | stessa conferma due volte → un solo effetto                         |
| Undo di piano       | un solo token annulla l'intero piano, non parzialmente              |
| cross-tenant        | il motore non vede impegni di un altro utente                       |

**Done when:** `npm run validate` verde; ADR del contratto planner scritto;
dataset planner con metriche di constraint-compliance e utilità; `EXPLAIN QUERY
PLAN` sulle query di composizione; runbook di recovery; matrice `/dod`.

**Out of scope E1:** linguaggio naturale, entità condivise, riprogrammazione
automatica, ottimizzazione globale.

---

## E2 — Vincoli espressi a parole

**Outcome.** "Pianificami la settimana lasciando libero il venerdì pomeriggio"
diventa l'input strutturato di E1.

- il modello produce **solo** vincoli normalizzati, mai un'allocazione: è
  l'applicazione diretta dell'invariante 12 e di
  [ADR-0002](../../decisions/0002-deterministic-core-ai-boundary.md);
- i vincoli passano dal validator semantico di C1 prima di raggiungere il motore;
- l'AI può inoltre **spiegare** un piano già calcolato, senza modificarlo: la
  spiegazione è testo, non una decisione;
- una richiesta con vincoli contraddittori produce `clarify`, non un piano
  costruito su un'interpretazione arbitraria.

**Test aggiuntivi:** vincolo fuori enum, vincolo contraddittorio, richiesta che
tenta di far allocare direttamente al modello, spiegazione che diverge dal
piano calcolato.

---

## E3 — Riprogrammazione

**Outcome.** Ciò che non è stato completato torna nel piano conservando il
motivo, senza sorprendere l'utente.

- il motivo del mancato completamento è un dato registrato, non dedotto;
- una modifica significativa (spostamento oltre una soglia, cambio di giorno)
  richiede conferma esplicita; una minore no;
- la riprogrammazione non riscrive la storia: il blocco originale resta
  auditabile;
- un task riprogrammato N volte è un segnale da mostrare all'utente, non da
  nascondere riprogrammando ancora.

**Test aggiuntivi:** riprogrammazione ripetuta, conferma richiesta sopra soglia,
concorrenza fra riprogrammazione e modifica manuale, dedupe delle notifiche.

---

## Rischi e mitigazioni

| Rischio                                             | Mitigazione                                                      | Prova                            |
| --------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Secondo aggregatore cross-domain accanto a `/oggi`  | riuso della composizione esistente attraverso le porte           | nessuna query cross-domain nuova |
| Piano instabile che si riorganizza a ogni ricalcolo | greedy con ordinamento e tie-break totali, niente ottimizzazione | test di determinismo             |
| Esito parziale scambiato per completo               | tre esiti tipizzati, `parziale` porta sempre la motivazione      | test sull'esito parziale         |
| Entità cambiata fra preview e apply                 | versione letta persistita e verificata all'apply                 | test stale version               |
| Undo frammentato su N entità                        | un solo token per piano, categoria Undo dedicata                 | test di Undo di piano            |
| DST che sposta silenziosamente un blocco            | finestre in `ZonedDateTime`, durata civile                       | property test DST                |
| Piani disumani per assenza di tetto                 | limite di carico deciso in G-E e applicato dal motore            | test sul carico                  |
| Deriva verso l'allocazione fatta dal modello        | E2 produce solo vincoli; l'allocazione resta nel codice          | test su vincoli fuori enum       |

---

## Criteri di uscita della Phase E

- [ ] a parità di input, clock e configurazione il piano è identico;
- [ ] nessun piano viola un vincolo `hard`, e `parziale` e `impossibile` sono
      sempre motivati in modo verificabile;
- [ ] preview, apply, stale version e Undo di piano sono provati end-to-end;
- [ ] il motore funziona con provider assente (E1 e E3 non lo usano affatto);
- [ ] property test su overlap, finestre, precedenze, durata e DST verdi;
- [ ] dataset planner con metriche di constraint-compliance registrate;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.

## Agent route

| Slice  | Writer principale        | Supporto                        | Reviewer                           |
| ------ | ------------------------ | ------------------------------- | ---------------------------------- |
| **E1** | `domain_worker`          | —                               | `quality_reviewer` (property test) |
| **E2** | `ai_integrations_worker` | `domain_worker` (validator)     | entrambi                           |
| **E3** | `domain_worker`          | `cloudflare_worker` (notifiche) | `quality_reviewer`                 |

Invarianti, contratto di input/output e scelta dell'algoritmo restano al main
agent. Un modello rapido può generare casi per il dataset, **mai** giudicare la
correttezza di un piano.
