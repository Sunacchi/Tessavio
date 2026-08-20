# ADR-0023 — Contratto ActionProposal, validator e confirmation policy (C1)

Stato: accepted
Data: 2026-08-20

## Contesto

La Phase C introduce l'AI come **interprete**, mai come autore delle scritture
([ADR-0002](0002-deterministic-core-ai-boundary.md), invariante 4). La slice C1
chiude schema, validator, policy, idempotenza e benchmark **con un provider
mock**: nessuna rete, nessuna credenziale, nessun costo. OAuth, cifratura e
budget reale arrivano in C2, quando il contratto è già congelato e provato.

Tre vincoli esterni verificati (appendice A del [piano di fase](../planning/phases/c-ai-byok.md))
hanno dato forma al contratto:

- il sottoinsieme strict dei provider vuole un **oggetto** alla radice, ogni
  proprietà in `required`, `additionalProperties: false` ovunque e profondità
  limitata: un `ActionProposal[]` nudo non è rappresentabile;
- `pattern`, `format`, `minimum`, `maxItems` **non** vengono applicati: metterli
  nello schema darebbe una falsa sensazione di sicurezza;
- `z.toJSONSchema()` di Zod 4 non produce da solo quel sottoinsieme (emette
  `$schema` e `maxItems`, e con i campi `.optional()` non li mette in
  `required`).

## Decisione

**Busta versionata.** Il modello restituisce
`{ schema_version: "c1.v1", proposals: ActionProposal[3], clarification }`.

**Proposta piatta, variante (A).** Un solo `payload` con tutti gli slot
`anyOf: [T, null]`; quali slot siano obbligatori per una data azione lo impone
il validator semantico, non lo schema. Lo schema è una guardia di forma;
l'autorità è Zod più il validator.

**Enum chiuso di sette azioni** (G0.1): `events.create`, `events.cancel`,
`reminders.create`, `reminders.cancel`, `tasks.create`, `tasks.complete`,
`query.today`. L'estensione a lavoro, finanze e liste è C1.2, dopo la baseline.

**Regola d'oro degli slot.** Il modello scrive il **testo grezzo**
(`"domani alle 15"`), mai un istante ISO, mai un importo in unità minori, mai un
ID. Risolvono i normalizzatori deterministici: `domains/ai/time-slot.ts` per il
tempo (Temporal + timezone IANA + istante del messaggio) e una lookup
tenant-scoped per i riferimenti. Conseguenze dirette:

- gli invarianti 7 (tempo) e 8 (denaro) restano interamente nel codice;
- un ID inventato è impossibile **per costruzione**: lo schema non ha un campo ID;
- se la lookup trova zero o più di un risultato l'esito è `clarify`, mai una scelta.

**Nessuna assunzione silenziosa.** Il validator distingue:

- `resolved` — ogni slot risolto senza inferenze;
- `assumed` — risolto con un'inferenza dichiarata (`"domani pomeriggio"` → 15:00);
- `unresolved` — manca un dato essenziale → `clarify`.

Un **default dichiarato** (durata evento 1 ora, priorità task media) non è
un'inferenza: viene mostrato all'utente ma non declassa la risoluzione.

**Confirmation policy tabellare e versionata** (`c1-policy-v1`), da
`(azione, abilitazione, risoluzione, cardinalità)` a
`execute_with_undo | preview_confirm | clarify | reject`:

| Condizione                            | Esito               |
| ------------------------------------- | ------------------- |
| azione non abilitata                  | `reject`            |
| dato essenziale mancante              | `clarify`           |
| classe di rischio distruttiva         | `preview_confirm`   |
| più di un'entità toccata              | `preview_confirm`   |
| risoluzione con inferenza (`assumed`) | `preview_confirm`   |
| altrimenti                            | `execute_with_undo` |

La `confidence` del modello **non è un input della policy**: non autorizza nulla.

**Esecuzione attraverso il registry dei comandi.** Una proposta validata diventa
il comando deterministico equivalente e passa dal registry di C0: eredita
authorization, idempotenza, audit e Undo del dominio. Non esiste un percorso
privilegiato dall'AI al database.

**Provenance.** Il registry usato dall'esecutore è costruito con
`provenance: "extracted"`: ogni entità creata da una proposta è marcata come
estratta per costruzione, non per convenzione. Le entità raggiungibili
dall'enum (`events`, `reminders`, `tasks`) hanno la colonna `provenance` con
default `entered`.

**Idempotenza sotto retry.**

1. envelope `AI_PROPOSAL` con lease proprio (default 180s): `INBOX_LEASE_SECONDS`
   vale 60s e una chiamata a un modello può superarlo;
2. il piano (proposte + decisioni) è persistito in `ai_proposal_jobs` **prima**
   di qualsiasi esecuzione: un retry rilegge invece di richiamare il modello;
3. ogni esecuzione usa il ledger `effects` con chiave `ai-exec:{jobId}:{index}`;
4. una preview genera un token opaco `aic_…`, single-use, user-bound e con TTL,
   consumato in modo atomico.

**NO_AI come percorso di prima classe.** Ogni variabile AI è opzionale e la
modalità è **derivata** dalla configurazione presente. Senza variabili il Worker
parte, il core deterministico funziona e `/ai` risponde che non è configurata.

## Conseguenze

- Il contratto è provabile senza credenziali: schema, validator, policy,
  idempotenza e benchmark si chiudono con il mock.
- Un cambio di enum, prompt o schema richiede di rieseguire il benchmark e
  confrontarlo con la baseline registrata in `benchmark/baselines/`.
- La baseline del mock misura l'**harness**, non la qualità di un modello: il
  confronto significativo arriva quando un provider reale gira lo stesso dataset.
- Lo schema strict è generato da Zod e **convertito**: il test di conformità
  (`tests/unit/ai-schema-conformance.test.ts`) è il guardrail che impedisce a un
  cambio apparentemente innocuo di rompere su un provider e non sull'altro.
- Il costo di una proposta ambigua è una domanda in più, non una scrittura
  sbagliata: è la scelta esplicita di questo contratto.

## Alternative considerate

- **`anyOf` di payload per azione (variante B):** schema più preciso, ma cresce
  con l'enum e il supporto di `anyOf` in strict mode non è uniforme fra i
  provider dietro OpenRouter. Resta il percorso di aggiornamento se il benchmark
  mostra troppi errori di slot.
- **Far produrre al modello istanti ISO e ID:** eliminerebbe i normalizzatori ma
  sposterebbe gli invarianti 7 e 8 dentro il modello, dove non sono verificabili.
- **Eseguire la chiamata AI dentro `INBOUND_MESSAGE`:** più semplice, ma il lease
  di 60 secondi scadrebbe a metà elaborazione e il messaggio verrebbe processato
  due volte.
