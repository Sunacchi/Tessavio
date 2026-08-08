# Milestone corrente — B3 Task (completata)

**Stato: completata localmente il 2026-08-08.** B3 consegna task private
deterministiche con priorità, scadenze tipizzate, complete/reopen e Undo.
Nessuna risorsa Cloudflare remota è stata creata e nessun deploy è stato
eseguito. B4 è la prossima milestone ma non viene attivata da questa consegna.

## Obiettivo

Permettere a un utente Telegram di creare, leggere, elencare, completare e
riaprire task esplicite senza AI, mantenendo separate assenza di scadenza, giorno
locale e istante temporale.

## Contratto consegnato

- `/task crea <nessuna|YYYY-MM-DD|YYYY-MM-DDTHH:mm> |
<bassa|media|alta> | Titolo` crea una task privata;
- `/task leggi <id>`, `/task lista`, `/task completa <id>` e
  `/task riapri <id>` sono user-scoped;
- `/annulla tsk_<token>` applica Undo single-use con TTL di 15 minuti e version
  check a create, complete o reopen;
- `date_only` conserva il giorno locale senza inventare un orario; `instant`
  conserva UTC e timezone IANA originale; `none` non conserva dati temporali;
- gap e fold DST vengono rifiutati; le scadenze passate esplicite sono ammesse
  per rappresentare lavoro arretrato;
- `/task lista` ordina deterministicamente per priorità, tipo/valore della
  scadenza, creazione e ID;
- `/oggi` e `/domani` includono eventi e task aperte in scadenza nella finestra
  civile dell'utente;
- non sono introdotti parsing naturale, AI, modifica task, ricorrenze, subtasks,
  planner, condivisione o Google Tasks.

## State machine e persistenza

```text
open -> completed
  ^         |
  |---------|  reopen
```

Complete su una task completata e reopen su una task aperta sono no-op
espliciti. Ogni mutation applicata usa authorization centralizzata, idempotency
key, batch D1 atomico con audit e Undo, e version check per concorrenza/restore.
Ogni repository richiede `UserScope`; non esiste accesso tenant-scoped per ID
nudo. I record restano fino alla cancellazione account; gli Undo scaduti sono
eliminati in batch bounded user-scoped.

Decisione e recovery sono documentati in
[ADR-0015](../decisions/0015-b3-task-contract.md) e nel
[runbook B3](../runbooks/B3_TASKS_RECOVERY.md).

## Exit criteria soddisfatti localmente

- create/read/list/complete/reopen e Undo sono autorizzati, idempotenti e
  auditati;
- `none|date_only|instant`, priorità e stato hanno shape e check SQL espliciti;
- ogni accesso repository include owner scope e i test negativi provano
  isolamento read/list/write/Undo;
- retry della stessa mutation non duplica task, audit o Undo;
- Undo prova replay, scadenza e stale version; purge è bounded e user-scoped;
- viste e ordinamento sono deterministici; DST gap/fold e giorni civili usano il
  solo polyfill Temporal fissato;
- migration fresh/upgrade, indici hot e rollback additivo sono riproducibili;
- format, lint, typecheck, unit, integration, security, migration, build e audit
  dipendenze sono gate obbligatori della consegna locale.

## Out of scope

- modifica di titolo, priorità o scadenza;
- delete/cancel, subtasks, durate, dipendenze e planner;
- ricorrenze, reminder collegati, assegnazioni o spazi condivisi;
- AI, `ActionProposal[]`, media e integrazioni esterne;
- deploy staging/production o creazione di risorse remote.
