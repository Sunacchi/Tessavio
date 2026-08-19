# ADR-0018 — B6.1 liste, item e note private

- Status: accepted
- Date: 2026-08-19

## Context

B6.1 deve offrire liste, item e note utilizzabili senza AI o integrazioni,
preservando multi-tenancy, authorization, idempotenza, audit e Undo. La slice
deve diventare una base privata riutilizzabile dalla futura condivisione, senza
anticipare `SpaceScope`, ricorrenze, ricerca, tag o operazioni bulk.

Liste e note hanno lifecycle diversi: una lista contiene item con state machine,
mentre una nota è testo standalone. Una tabella polimorfa renderebbe più deboli
i vincoli e preparerebbe un'astrazione cross-domain non necessaria.

## Decision

- `list`, `list_item` e `note` sono entità distinte, private e sempre lette o
  mutate con `UserScope`; il riferimento item -> lista è vincolato anche per
  `user_id`;
- una lista ha titolo di 1-100 caratteri; una nota ha titolo di 1-100 e corpo di
  1-4000 caratteri; un item ha testo di 1-300 caratteri. Whitespace esterno viene
  rimosso e caratteri di controllo sono rifiutati;
- liste e note hanno stato `active|deleted`; gli item hanno
  `open|completed|deleted`. Tutte le entità hanno versione positiva, provenance
  `manual_command`, timestamp e chiave dell'ultima mutation;
- update, state change e delete richiedono la versione attesa. Le liste non
  possono essere eliminate se contengono item non eliminati: B6.1 non esegue
  cascade o mutation bulk implicite;
- create/update/state change/delete sono atomiche con audit e record Undo
  `lst_...` single-use di 15 minuti. Undo di una create elimina fisicamente la
  nuova entità solo se versione e riferimenti sono invariati; gli altri Undo
  ripristinano la snapshot con una nuova versione;
- liste e note restituiscono al massimo 50 record; una lista mostra al massimo
  100 item. Ordinamento stabile: `created_at`, poi `id`;
- entità attive/eliminate e audit restano fino alla cancellazione account. Gli
  Undo scaduti sono eliminati con purge bounded user-scoped; contenuti e snapshot
  non vengono loggati.

## Consequences

- lo schema B6.1 aggiunge soltanto `lists`, `list_items`, `notes` e
  `list_undo_actions`, con indici tenant-scoped e FK composta item/lista;
- ID globalmente univoci restano un dettaglio tecnico: nessun repository accetta
  un ID tenant-scoped senza `UserScope`;
- il delete di una lista con item restituisce un esito esplicito e non modifica
  alcuna riga;
- non vengono aggiunti Cron, Queue envelope, binding o dipendenze. B6.2 sceglierà
  separatamente target e semantica della ricorrenza.

## Revisit conditions

Rivedere il contratto quando F1 introduce `SpaceScope` e liste condivise, oppure
quando una milestone autorizza bulk, riordino, tag, ricerca, allegati o
ricorrenze. La condivisione non deve convertire implicitamente record privati.
