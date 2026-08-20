# ADR-0025 — Budget, privacy e model policy dell'AI (C2)

Stato: accepted
Data: 2026-08-20

## Contesto

Un provider AI a consumo introduce tre rischi distinti: spendere più del
previsto, mandare dati a un endpoint che li conserva, e usare un modello che non
supporta gli output strutturati su cui poggia tutto il contratto di
[ADR-0023](0023-action-proposal-contract.md).

Un pre-check semplice del budget non basta: due job concorrenti lo superano
entrambi.

## Decisione

**Tre controlli distinti, non sostituibili fra loro.**

1. **Budget applicativo con prenotazione atomica.** Prima della chiamata, una
   riga `ai_budget_entries` viene inserita solo se il totale del giorno resta
   entro il tetto (`INSERT … SELECT … WHERE (SELECT SUM(…)) + ? <= ?`). Il
   consuntivo chiude la prenotazione con il costo reale letto da `usage.cost`.
   Una chiamata fallita **rilascia** la prenotazione; una prenotazione rimasta
   appesa viene rilasciata dal Cron dopo un'ora, così il budget non resta
   bloccato per sempre.
2. **Hard limit del provider.** Pre-volo `GET /api/v1/key`: se il credito
   residuo è sotto il costo massimo dell'operazione, la chiamata non parte.
3. **Costo massimo per operazione.** `max_price` limita le tariffe degli
   endpoint in USD per milione di token; non è un tetto sul totale della
   chiamata. Il totale è limitato combinando quelle tariffe versionate con un
   `max_tokens` calcolato sul budget residuo dopo un upper bound conservativo
   dei token di input. Se restano meno di 128 token di output, la rete non viene
   chiamata e la prenotazione viene rilasciata.

Al superamento la risposta è un **rifiuto esplicito** con messaggio utile, mai
un degrado silenzioso verso un modello più economico.

**Denaro in interi.** I costi sono in **micro-unità** (milionesimi di USD):
`usage.cost` arriva come numero decimale e viene convertito una sola volta, al
confine dell'adapter. Nessun `float` attraversa il dominio (invariante 8).

**Privacy strict per default.** Nel blocco `provider` della richiesta:
`data_collection: "deny"`, `zdr: true`, `require_parameters: true`. Il terzo
campo è quello che evita il fallimento "modello non supportato": OpenRouter
esclude gli endpoint privi di structured outputs invece di provarci. Il fallback
resta consentito solo verso endpoint di privacy uguale o migliore e sotto il
tetto di costo.

**Allowlist, prezzi ceiling e prompt sono configurazione versionata**, non dominio:
`src/ai/model-policy.ts` e `src/ai/prompt.ts`, entrambi con una versione
esplicita. Un modello fuori allowlist non è un fallback: è un rifiuto.

**Timeout e interruttore.** Ogni chiamata ha un timeout esplicito; dopo tre
fallimenti consecutivi l'interruttore si apre per trenta secondi. Lo stato è per
isolate: basta a evitare retry storm senza introdurre stato condiviso.

**Log senza segreti.** Nessun prompt, nessuna credenziale, nessun contenuto
utente nei log: solo correlation ID, modello, esito, latenza e costo
(invariante 5).

**Retention.** `ai_proposal_jobs` 30 giorni; sessioni OAuth TTL 10 minuti con
purge; ledger di budget 90 giorni. La purge gira nel Cron di manutenzione, è
idempotente e bounded.

## Conseguenze

- Il costo massimo di un messaggio è noto **prima** della chiamata e verificato
  da test sul calcolo del limite e da un test a due job concorrenti.
- Il budget è per utente e per giorno civile della sua timezone: un utente non
  può esaurire il budget di un altro.
- Con provider mock i tre controlli restano attivi ma il costo è zero: la
  differenza fra le due modalità è la configurazione, non il percorso di codice.
- La modalità free/best-effort resta **fuori** dalla Phase C (gate G0.2): non è
  implicita, è esclusa e dichiarata.

## Condizioni di riesame

Riesaminare quando esiste traffico reale (i tetti vanno tarati su dati, non su
stime), se OpenRouter cambia il formato di `usage.cost` o dei parametri
`provider`, oppure se si decide di introdurre la modalità free.
