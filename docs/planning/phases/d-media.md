# Phase D — Voce, vision e allegati transitori

> Stato: **non attiva**. Dipende da C1 (pipeline `ActionProposal`) e da C2
> (credenziale utente e ledger di budget). Questo è il piano esecutivo, non
> un'autorizzazione: si implementa solo ciò che [CURRENT_MILESTONE](../CURRENT_MILESTONE.md)
> attiva.

## Sintesi

L'utente manda un vocale, una foto di uno scontrino o un PDF, e ottiene le
stesse proposte revisionabili che otterrebbe scrivendo. Il media non viene mai
conservato.

| Slice   | Outcome                                                    | Gate d'ingresso      |
| ------- | ---------------------------------------------------------- | -------------------- |
| **G-D** | decisioni del proprietario congelate                       | C2 chiusa            |
| **D1**  | messaggi vocali → trascrizione revisionabile → proposte    | G-D                  |
| **D2**  | immagini → estrazione strutturata con provenance per campo | D1                   |
| **D3**  | PDF e documenti in allowlist → routing ai domini           | D2 + decisione su J2 |

Le tre idee che reggono il piano:

1. **Il media non tocca mai un disco.** Il ciclo di vita è la singola
   invocazione del consumer: il file esiste in memoria e sparisce con essa.
   L'invariante 6 ("eliminare in `finally`") si soddisfa **non persistendo
   affatto**, che è più forte e molto più facile da provare. Introdurre R2 è una
   decisione separata, non un dettaglio implementativo di D.
2. **La trascrizione è contenuto non fidato**, esattamente come un messaggio
   inoltrato di C3: stessi test di prompt injection, stesso validator, stessa
   riautorizzazione.
3. **Due strati di errore si sommano.** Sopra l'incertezza del modello c'è
   quella dello speech-to-text. Per questo la confirmation policy di D1 non
   ammette `execute_with_undo` come default: si conferma la trascrizione, poi si
   applica la policy di C1.

---

## G-D — Gate d'ingresso: decisioni del proprietario

- [ ] **Dove gira lo speech-to-text.** OpenRouter espone
      `POST /api/v1/audio/transcriptions`, che accetta la stessa credenziale
      utente di C2, accetta l'oggetto `provider` (quindi `data_collection: "deny"`
      e `zdr`) e restituisce `usage.cost`: costo e dati restano sull'utente e il
      ledger di budget di C2.4 funziona senza modifiche.
      **Raccomandazione: usare OpenRouter.** L'alternativa Workers AI (Whisper su
      binding Cloudflare) sposterebbe costo e contenuto vocale sul proprietario e
      aggiungerebbe un processor alla
      [matrice di residenza](../../privacy/PROCESSOR_AND_RESIDENCY_MATRIX.md):
      è una scelta di prodotto e di privacy, non un default tecnico.
- [ ] **Limiti di ingaggio.** Durata massima del vocale, dimensione massima del
      file, numero massimo di media per messaggio e per finestra temporale.
      Servono **prima** di D1: sono ciò che impedisce a un singolo messaggio di
      esaurire memoria o budget.
- [ ] **Classificazione del dato vocale.** Un vocale può contenere dati
      altamente personali senza che l'utente lo intenda. Confermare che la
      [DATA_POLICY](../../privacy/DATA_POLICY.md) copre trascrizione e scarto,
      e che la DPIA prevista per I3.1 include l'audio.
- [ ] **Perimetro D3.** Quali tipi di documento entrano nell'allowlist iniziale
      e se D3 precede o segue J2 (archivio cifrato). Raccomandazione: D3 resta
      **solo estrazione transitoria**; l'archiviazione è J2 e non si anticipa.

---

## D1 — Messaggi vocali

**Outcome.** Un vocale produce una trascrizione che l'utente vede e può
correggere, e da lì le stesse proposte del testo.

### Contratto da congelare in ADR

**Ammissione prima del download.** L'update Telegram contiene già
`voice.file_size` e `voice.duration`: il rifiuto avviene su quei campi, **prima**
di chiamare `getFile`. Scaricare venti megabyte per scoprire che sono troppi è
il difetto da evitare per costruzione.

**Il download URL contiene il bot token.** Il formato è
`https://api.telegram.org/file/bot<token>/<file_path>`: quell'URL non deve
comparire in un log, in un messaggio di errore o in un campo di audit
(invariante 5 — è un leak di credenziale, non un dettaglio di privacy). Si
conserva il `file_id`, mai l'URL; il `file_path` restituito da `getFile` vale
almeno un'ora e si rigenera chiamando di nuovo `getFile`.

**Limiti di piattaforma.** Un bot scarica al massimo **20 MB**. Un file al
limite diventa circa 27 MB una volta codificato in base64 per il provider,
contro i 128 MB di memoria del Worker: il cap di prodotto deve stare
comodamente sotto, e va scelto in G-D sulla durata, non solo sui byte.

**Pipeline.**

```
update con voice
  → ammissione (size, duration, quantità)   ← nessuna rete
  → getFile + download                       ← solo nel consumer, mai nel webhook
  → base64 in memoria
  → POST /api/v1/audio/transcriptions        ← credenziale utente, provider policy
  → testo trascritto (non fidato)
  → pipeline ActionProposal di C1
  → preview con trascrizione visibile e correggibile
```

**Confirmation policy dedicata.** Un input vocale non può produrre
`execute_with_undo` in D1: la trascrizione va confermata o corretta prima che la
policy di C1 decida. Una volta corretto il testo, il percorso è identico a
quello testuale e non esiste una seconda strada.

**Envelope e lease.** STT più generazione della proposta sommano due chiamate
esterne: serve un envelope `AI_MEDIA` con lease proprio, più lungo di quello di
`AI_PROPOSAL`, per la stessa ragione già documentata in
[C1](c-ai-byok.md#idempotenza-sotto-retry). Il retry riusa la trascrizione
persistita, non richiama lo speech-to-text: senza questo, un retry paga due
volte.

**Budget.** La risposta di transcription include `usage.cost` e `usage.seconds`:
si prenota e si liquida sullo stesso ledger di C2.4, senza un secondo
meccanismo.

### Test obbligatori D1

| Test                | Deve provare                                                                |
| ------------------- | --------------------------------------------------------------------------- |
| ammissione          | file oltre il cap rifiutato **senza** aver chiamato `getFile`               |
| nessuna persistenza | dopo l'elaborazione non esiste alcun riferimento al media                   |
| scan dei log        | nessun log contiene il download URL, il `file_path` o il bot token          |
| idempotenza         | stesso `jobId` due volte → una sola trascrizione, una sola write            |
| lease               | STT lento oltre il lease → nessuna doppia elaborazione                      |
| prompt injection    | vocale il cui testo ordina di ampliare lo scope → nessuna azione fuori enum |
| fallimento STT      | provider in errore o timeout → messaggio utile, nessuna write               |
| trascrizione vuota  | audio senza parlato → richiesta esplicita, mai una proposta inventata       |
| budget              | vocale lungo che supera il tetto → rifiuto esplicito prima della chiamata   |
| NO_AI               | vocale con provider assente → messaggio che indica il comando testuale      |

**Done when:** `npm run validate` verde; ADR del contratto media scritto;
benchmark esteso con voce italiana sintetica; runbook di recovery; matrice
`/dod` compilata.

**Out of scope D1:** immagini, documenti, archiviazione, correzione della
trascrizione tramite un secondo giro di modello.

---

## D2 — Immagini e vision

**Outcome.** Una foto di uno scontrino, di un cartellone o di uno schermo
produce un'estrazione strutturata che l'utente verifica campo per campo.

- immagine inviata al modello come data URL base64 nel messaggio multimodale,
  con la stessa `provider` policy di C2.3;
- **provenance per campo, non per entità:** ogni valore estratto porta con sé
  se è stato letto, dedotto o assunto — è ciò che rende la correzione mirata
  invece che un rifacimento;
- **preview obbligatoria** quando l'immagine contiene più di un'entità, quando
  la certezza è bassa o quando l'estrazione produrrebbe un batch. Nessuna
  eccezione: un'immagine con dieci righe di scontrino non è un'azione a basso
  rischio;
- gli importi seguono l'invariante 8: il modello estrae il **testo** dell'importo
  e il parser di B5 lo converte in minor unit;
- limiti di dimensione e di numero di immagini per messaggio decisi in G-D.

**Test aggiuntivi:** immagine illeggibile, immagine senza contenuto pertinente,
immagine con testo ostile sovrapposto (prompt injection visiva), estrazione
parziale, formato non supportato, immagine oltre il cap.

---

## D3 — Documenti e allegati in allowlist

**Outcome.** Un PDF di prenotazione, una bolletta o una ricevuta inoltrata
diventa una proposta verso il dominio giusto.

- **allowlist stretta di tipi**, verificata sul contenuto e non sull'estensione
  né sul `mime_type` dichiarato dal client;
- parser bounded: limite di pagine, di dimensione decompressa e di tempo. Un
  archivio annidato o un documento che si espande oltre il limite è un rifiuto,
  non un tentativo;
- nessuna esecuzione di contenuto attivo incorporato nel documento;
- **estrazione transitoria soltanto.** L'originale non viene conservato: se
  l'utente vuole archiviarlo è un use case esplicito di J2, con cifratura,
  authorization e retention proprie, e non si anticipa qui;
- routing verso i domini esistenti attraverso il registry di C0, senza
  introdurre entità nuove.

**Test aggiuntivi:** documento oltre i limiti, documento malformato, contenuto
attivo, `mime_type` mentito, decompressione eccessiva, estrazione parziale con
provenance corretta.

---

## Rischi e mitigazioni

| Rischio                                         | Mitigazione                                                | Prova                         |
| ----------------------------------------------- | ---------------------------------------------------------- | ----------------------------- |
| Bot token nei log via download URL              | si conserva il `file_id`, mai l'URL; scan dei log nel gate | test di scan dei log          |
| Memoria esaurita da un file al limite           | ammissione prima del download su `file_size`/`duration`    | test di ammissione            |
| Retry che paga due volte lo speech-to-text      | trascrizione persistita prima della proposta               | test di idempotenza           |
| Lease più corto di STT + proposta               | envelope `AI_MEDIA` con lease dedicato                     | test con provider lento       |
| Errore STT amplificato da un'esecuzione diretta | nessun `execute_with_undo` da input vocale in D1           | property test sulla policy    |
| Prompt injection dentro audio o immagine        | contenuto sempre come dato, validator riautorizza          | test security D1 e D2         |
| Documento ostile o zip bomb                     | allowlist sul contenuto, limiti di decompressione e tempo  | test D3                       |
| Costo vocale imprevedibile                      | cap di durata in G-D più prenotazione su `usage.cost`      | test di budget                |
| Deriva verso l'archiviazione dei media          | D è solo transitoria; l'archivio è J2                      | assenza di tabelle media in D |

---

## Criteri di uscita della Phase D

- [ ] nessun media e nessun riferimento transitorio sopravvive all'elaborazione,
      verificato automaticamente e non asserito;
- [ ] nessun log contiene URL di download, `file_path`, token o contenuto estratto;
- [ ] trascrizione ed estrazione sono sempre revisionabili prima della write;
- [ ] budget, privacy e capability valgono per i media come per il testo;
- [ ] il benchmark copre voce italiana, screenshot e immagini sintetiche;
- [ ] con provider assente il prodotto indica il percorso testuale e non fallisce;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.

## Agent route

| Slice  | Writer principale        | Supporto                       | Reviewer                                      |
| ------ | ------------------------ | ------------------------------ | --------------------------------------------- |
| **D1** | `ai_integrations_worker` | `cloudflare_worker` (download) | `data_security_reviewer` (obbligatorio)       |
| **D2** | `ai_integrations_worker` | `domain_worker` (provenance)   | `quality_reviewer` + `data_security_reviewer` |
| **D3** | `domain_worker`          | `ai_integrations_worker`       | entrambi                                      |

Il threat model dei media e il lifecycle sono del main agent, non del writer.

## Appendice — Fatti esterni verificati

Verificati il **2026-08-19**, da riverificare all'inizio di D.

**Telegram Bot API**

- un bot scarica file fino a **20 MB** via `getFile`;
- il `file_path` restituito vale **almeno un'ora** e si rigenera richiamando
  `getFile` con lo stesso `file_id`;
- URL di download: `https://api.telegram.org/file/bot<token>/<file_path>` —
  **contiene il bot token**;
- l'update di un vocale porta già `file_size` e `duration`.

**OpenRouter — audio**

- `POST https://openrouter.ai/api/v1/audio/transcriptions`, JSON con
  `input_audio: { data (base64), format }`, `model`, `language` opzionale
  (ISO-639-1, altrimenti autodetect), `provider` opzionale;
- risposta `{ text, usage: { cost, seconds, input_tokens, output_tokens } }`;
- l'audio si può inviare anche a `/chat/completions` come contenuto
  `input_audio`; formati dichiarati: `wav`, `mp3`, `aiff`, `aac`, `ogg`,
  `flac`, `m4a`, `pcm16`, `pcm24`, con supporto **dipendente dal modello**;
- nessun limite di dimensione documentato: il limite è di prodotto, non del provider.

**Cloudflare Workers**

- memoria per isolate: 128 MB. La codifica base64 aumenta il payload di circa un
  terzo rispetto al file originale.
