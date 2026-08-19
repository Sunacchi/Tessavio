# Milestone corrente — Phase B Core deterministico (completata)

**Stato: completata e validata localmente il 2026-08-19.** Foundation e slice
B1-B7 sono chiuse, inclusi i gate trasversali. C1 ActionProposal è la prossima
milestone di prodotto prevista ma non è attivata: richiede un aggiornamento
esplicito di questo file. Nessuna risorsa Cloudflare remota è stata creata e
nessun deploy è stato eseguito.

## Risultato

Il prodotto deterministico funziona attraverso Telegram, Queue e D1 senza un
provider AI. Include preferenze, eventi, reminder one-off e daily/weekly, task,
lavoro, finanze manuali, liste/note, report testuali e CSV con Undo e audit dove
applicabili.

## Gate trasversali chiusi

- `/oggi` e `/domani` compongono eventi, task, reminder operativi e turni
  pianificati nella finestra civile IANA dell'utente;
- ogni contributor è autorizzato separatamente e ogni repository riceve
  `UserScope`;
- tutte le categorie Undo B hanno TTL, purge bounded, fake clock, idempotenza e
  prova cross-tenant;
- il delivery ledger reminder applica retention di 30 giorni solo agli stati
  terminali e non elimina tentativi attivi;
- la demo B1-B7 attraversa webhook, Queue, D1, CSV e Undo con runtime privo di
  binding o credenziali AI;
- query hot e indici sono verificati con `EXPLAIN QUERY PLAN`;
- `npm run validate` è verde (33 file Vitest, 148 test) e la build è soltanto
  un dry-run locale.

Il contratto trasversale è congelato in
[ADR-0021](../decisions/0021-phase-b-closure.md) e l'evidenza riproducibile è nel
[runbook Phase B](../runbooks/PHASE_B_CLOSURE.md).

## Out of scope

- attivazione o scaffold di C1-C3;
- OAuth/BYOK, provider AI, modelli, prompt o ActionProposal;
- media, documenti, condivisione, planner, briefing e Google Calendar;
- account export/delete completo e sweep globale per utenti inattivi;
- Open Banking, pagamenti, nuove dipendenze, binding o deploy remoto.

## Piani di fase

Indice: [phases/README.md](phases/README.md). Il piano della fase chiusa è
[b-core.md](phases/b-core.md); quello della prossima, **non attiva**, è
[c-ai-byok.md](phases/c-ai-byok.md). Aprire solo il file della fase autorizzata
da questo documento.

## Prossima decisione

Il prossimo ciclo può attivare C1 soltanto aggiornando esplicitamente questo
file con contratto, dataset/metriche, schema strict, validator/policy e gate DoD.
La chiusura Phase B non costituisce autorizzazione implicita a iniziare C1.
