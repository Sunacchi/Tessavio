# Piani di fase

Una fase per file. Aprire **soltanto** il file della fase attiva secondo
[CURRENT_MILESTONE](../CURRENT_MILESTONE.md); le altre sono impegni ordinati,
non autorizzazioni a implementare.

| Fase | File                                         | Stato      | Contenuto                                                         |
| ---- | -------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| A    | [a-foundation.md](a-foundation.md)           | completata | webhook, Queue, identità, idempotenza, audit                      |
| B    | [b-core.md](b-core.md)                       | completata | core deterministico B1-B7                                         |
| C    | [c-ai-byok.md](c-ai-byok.md)                 | non attiva | `ActionProposal`, OpenRouter OAuth, policy                        |
| D    | [d-media.md](d-media.md)                     | non attiva | voce e vision transitorie                                         |
| E    | [e-planner.md](e-planner.md)                 | non attiva | planner deterministico                                            |
| F    | [f-sharing.md](f-sharing.md)                 | non attiva | `SpaceScope`, membership, ruoli                                   |
| G    | [g-proactive.md](g-proactive.md)             | non attiva | briefing e assistenza proattiva                                   |
| H    | [h-google-calendar.md](h-google-calendar.md) | non attiva | export, reconcile, sync bidirezionale                             |
| I    | [i-beta.md](i-beta.md)                       | non attiva | Mini App, diritti, release candidate                              |
| J-O  | [j-o-extended.md](j-o-extended.md)           | non attive | documenti, finanze avanzate, casa, viaggi, benessere, convergenza |

Chiusura di un gate: [RELEASE_CLOSURE.md](../RELEASE_CLOSURE.md).
