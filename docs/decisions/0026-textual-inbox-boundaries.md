# ADR-0026 — Confini dell'Inbox testuale (C3)

Stato: accepted
Data: 2026-08-20

## Contesto

Fino a C1.2 l'AI si attiva solo con `/ai proponi`. C3 rende il prodotto quello
promesso: **scrivi come parli** e il testo diventa lavoro instradato verso i
domini esistenti. Il rischio non è tecnico ma di confine — un'Inbox che
"capisce tutto" tende a diventare un secondo posto dove vivono entità e regole,
esattamente ciò che [ADR-0010](0010-inbox-and-domain-boundaries.md) vieta.

## Decisione

**L'Inbox è una registrazione, non un layer.** Il testo che nessun comando
riconosce è il `kind` `unsupported`: la slice AI lo registra nel registry di C0
e lo trasforma in un job `AI_PROPOSAL`. Da lì il percorso è **identico** a
quello di `/ai proponi`: schema strict → Zod → validator → policy → registry dei
comandi. Nessuna entità nuova, nessuna regola di dominio duplicata.

Conseguenza diretta: **senza AI configurata l'Inbox non esiste**. La
registrazione non c'è e il testo libero resta senza risposta, come prima. `NO_AI`
non degrada, semplicemente non offre la funzione.

**L'Inbox parla solo se ha qualcosa da dire.** Un job originato da testo libero
che non produce proposte si chiude in silenzio; un comando esplicito riceve
sempre un esito. La differenza è nel campo `origin` dell'envelope, non in una
euristica sul testo. Sotto gli otto caratteri il testo non apre nemmeno un job:
"ok" e "grazie" sono reazioni, non richieste.

**I link non vengono scaricati.** Un URL è testo e metadato. Fare fetch
significherebbe SSRF, una nuova egress e un lifecycle del contenuto raw da
progettare: è una slice a sé, non un dettaglio di C3. Un test lo verifica
sorvegliando `fetch`.

**Provenance minima.** Il messaggio porta con sé se è un **inoltro**
(`forwarded`) e il proprio timestamp; l'entità creata resta marcata come
estratta. Non registriamo **chi** ha inoltrato: serve a qualificare il testo,
non a profilare terzi.

**Il contenuto utente è dato, mai istruzione.** L'enum è chiuso, il validator
riautorizza ogni proposta e le azioni distruttive restano in preview per
costruzione. Un inoltro che ordina di "ignorare le istruzioni precedenti" non
può ampliare tool, scope o policy, e il test security lo verifica sul percorso
completo.

**Idempotenza per proposta, non per messaggio.** Un messaggio con tre intenti
produce tre chiavi `ai-exec:{jobId}:{index}` nel ledger `effects`: un retry
riesegue esattamente ciò che manca.

## Conseguenze

- Il costo di un messaggio di testo libero è quello di una chiamata al modello,
  quindi il budget di [ADR-0025](0025-ai-budget-privacy-model-policy.md) diventa
  la difesa principale contro l'abuso: senza budget residuo l'Inbox rifiuta
  esplicitamente.
- Il confine "un URL è testo" va ridiscusso quando esisterà una slice che
  scarica contenuti: sarà quella a introdurre allowlist, timeout e retention del
  raw, non C3.
- Il silenzio dell'Inbox è una scelta di prodotto: un assistente che risponde a
  ogni frase diventa rumore. Se l'uso reale mostra che gli utenti si aspettano
  una conferma, la regola si cambia in un punto solo.

## Condizioni di riesame

Riesaminare se compaiono falsi positivi frequenti su testo conversazionale (la
soglia e il silenzio vanno tarati su dati reali), oppure quando una slice
successiva introdurrà il download dei contenuti collegati.
