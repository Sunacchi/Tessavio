# Routing dei modelli

> Leggere quando si assegna una task a un agente o si chiude una fase.
> Il ruolo di ciascun profilo è in [README.md](README.md).

## Routing dei modelli

Il modello si sceglie per responsabilità, non si assegna automaticamente un solo
modello a tutta la fase. Gli identificativi disponibili e i relativi costi vanno
ricontrollati quando parte la task; il routing di responsabilità resta questo:

| Modello/classe                | Uso principale                                                                                                                               | Evitare                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Sol**                       | main orchestrator, contratti cross-layer, ADR, concorrenza/idempotenza, tenancy, authorization, crypto, integrazione finale e firma del gate | task meccaniche già completamente specificate                                          |
| **Sonnet**                    | writer predefinito: vertical slice bounded, CRUD/domain service, adapter, migration già progettata, test e bug fix con file ownership chiara | decidere scope, cambiare invarianti o auto-approvare la fase                           |
| **Terra o modello rapido**    | ricognizione read-only, aggiornamenti documentali meccanici, fixture sintetiche, link/checklist e modifiche locali a basso rischio           | security review finale, migration rischiosa, OAuth/crypto, planner o merge cross-layer |
| **Modello/strumento visuale** | verifica Mini App, responsive, accessibilità e flussi visivi dopo implementazione                                                            | autorizzazione, dati o decisioni di dominio                                            |

Regola pratica:

- [ ] usare **Sol** quando un errore può propagarsi fra moduli o violare un invariante;
- [ ] usare **Sonnet** quando contratto, scope, ownership e Done sono già congelati;
- [ ] usare un modello rapido solo se il risultato viene verificato da test o da
      Sol/Sonnet prima del merge;
- [ ] far tornare la task a Sol se emergono decisioni non previste, file condivisi,
      failure window distribuite o finding security;
- [ ] far eseguire la firma finale della fase a Sol, mai al writer che l'ha implementata.

## Routing consigliato per fase

| Fase                | Sol                                                            | Sonnet                                                              | Altri                                                                   |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **A1 Foundation**   | preflight, ADR, contratti inbox/effect, integrazione e gate    | toolchain, webhook, consumer, adapter D1/Telegram e test bounded    | modello rapido per inventario/link; reviewer security/quality read-only |
| **A2/B2 Reminder**  | state machine, lease/recovery, semantica delivery              | repository, Cron/Queue adapter, Telegram delivery e fault test      | modello rapido solo per fixture/documenti                               |
| **B Core**          | contract packet di ogni slice, tempo/Undo e integrazione       | writer principale per eventi, task, lavoro, spese, liste e report   | modello rapido per fixture e documentazione derivata                    |
| **C AI**            | `ActionProposal`, policy, OAuth/crypto, budget e gate privacy  | adapter OpenRouter, config, provider mock, benchmark harness e test | modello rapido per dataset sintetico, sempre revisionato                |
| **D Media**         | threat model, lifecycle/retention e integrazione pipeline      | download/STT/vision adapter, cleanup e test failure                 | strumenti media solo su fixture sintetiche                              |
| **E Planner**       | invarianti, algoritmo/contratti, preview/apply e property gate | implementazione pura dopo specifica, ottimizzazioni e test          | modello rapido per generare casi, non per giudicare correttezza         |
| **F Sharing**       | role matrix, tenancy, invite lifecycle e security gate         | repository/use case/UI Telegram bounded                             | modello rapido per matrice fixture, con review Sol                      |
| **G Proattività**   | contratti contributor, quiet hours, dedupe e policy UX         | query/report e delivery bounded                                     | reviewer privacy/quality su contenuto e ripetizioni                     |
| **H Google**        | OAuth, mapping/idempotenza, conflict policy e gate             | adapter Calendar, Queue/retry e provider test                       | modello rapido per fixture API sanificate                               |
| **I Mini App/beta** | trust boundary, export/delete, risk acceptance e go/no-go      | frontend, API contrattualizzate, fix bounded e regression test      | browser visuale + strumenti load/security                               |
| **J-N Domini**      | confini/link, lifecycle, scope e integrazione finale           | una vertical slice dominio alla volta                               | reviewer security/quality secondo sensibilità                           |
| **O Convergenza**   | ricerca cross-domain, release gate e risk acceptance           | fix bounded e prove end-to-end                                      | strumenti load/security; modello rapido solo per report                 |

Gli identificativi e i costi dei modelli vanno riverificati all'inizio della
task: qui è fissata la responsabilità, non il nome commerciale.
