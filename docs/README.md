# Indice della documentazione

> Non leggere tutto. Ogni riga dice **quando** aprire un documento e quanto
> costa. Le regole operative stanno in [`AGENTS.md`](../AGENTS.md), la verità
> durevole di prodotto qui, i dettagli di implementazione accanto al codice.

## Da leggere sempre

| Documento                                           | Peso   | Quando                                                |
| --------------------------------------------------- | ------ | ----------------------------------------------------- |
| [`AGENTS.md`](../AGENTS.md)                         | ~10 KB | invarianti e regole di lavoro, prima di ogni modifica |
| [Milestone corrente](planning/CURRENT_MILESTONE.md) | ~2 KB  | l'unico perimetro autorizzato                         |

## Prodotto e architettura

| Documento                                                                  | Peso   | Quando                                                        |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| [Visione e requisiti](PROJECT.md)                                          | ~9 KB  | serve capire _cosa_ fa il prodotto e cosa non farà mai        |
| [Architettura](architecture/ARCHITECTURE.md)                               | ~10 KB | una modifica attraversa un confine fra layer o flussi critici |
| [Struttura del repository](architecture/REPOSITORY_STRUCTURE.md)           | ~2 KB  | non sai dove va un file nuovo                                 |
| [Strategia di test](TESTING.md)                                            | ~5 KB  | scrivi o estendi test                                         |
| [Definition of Done](planning/DEFINITION_OF_DONE.md)                       | ~4 KB  | chiudi una feature                                            |
| [Sicurezza](../SECURITY.md)                                                | ~5 KB  | segnalazione vulnerabilità e postura di sicurezza             |
| [Baseline dati e privacy](privacy/DATA_POLICY.md)                          | ~10 KB | introduci una nuova categoria di dati persistiti              |
| [Matrice processor e residenza](privacy/PROCESSOR_AND_RESIDENCY_MATRIX.md) | ~7 KB  | aggiungi un servizio esterno o valuti la residenza            |

## Pianificazione

| Documento                                                    | Peso   | Quando                                                                             |
| ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| [Piani di fase](planning/phases/README.md)                   | indice | apri **solo** il file della fase attiva                                            |
| [Master action plan](planning/MASTER_ACTION_PLAN.md)         | ~9 KB  | stato generale, decision register e invarianti di piano                            |
| [Roadmap](planning/ROADMAP.md)                               | ~20 KB | serve la sequenza completa A-O; per lo stato basta la tabella iniziale             |
| [Copertura dei requisiti](planning/REQUIREMENTS_COVERAGE.md) | ~30 KB | verifichi se una capacità è implementata o solo pianificata; la sintesi è in testa |
| [Backlog](planning/BACKLOG.md)                               | ~10 KB | rimandi un lavoro o cerchi un elemento già rimandato                               |
| [Chiusura di release](planning/RELEASE_CLOSURE.md)           | ~3 KB  | solo alla chiusura di un gate (I3 o O)                                             |

## Agenti

| Documento                                      | Peso  | Quando                                    |
| ---------------------------------------------- | ----- | ----------------------------------------- |
| [Manuale degli agenti](agents/README.md)       | ~3 KB | scegli a chi delegare                     |
| [Orchestrazione](agents/ORCHESTRATION.md)      | ~6 KB | conduci una task dall'outcome al commit   |
| [Routing dei modelli](agents/MODEL_ROUTING.md) | ~9 KB | scegli il modello per una task o una fase |
| [Template di task](agents/TASK_TEMPLATE.md)    | ~6 KB | assegni lavoro a un subagente             |
| [Protocollo di handoff](agents/HANDOFF.md)     | ~1 KB | consegni il risultato                     |

## Decisioni e operatività

| Documento                                          | Peso  | Quando                                                           |
| -------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| [Indice ADR](decisions/README.md)                  | ~2 KB | cerchi il _perché_ di un vincolo; apri **solo** l'ADR pertinente |
| [Indice runbook](runbooks/README.md)               | ~2 KB | serve una procedura operativa: la tabella dice quale aprire      |
| [Runbook di sviluppo](runbooks/DEVELOPMENT.md)     | ~2 KB | configuri l'ambiente locale                                      |
| [Gate pre-pilot](runbooks/PRE_PILOT_OPERATIONS.md) | ~4 KB | valuti capacità e go/no-go                                       |

## Regole di manutenzione

- Una regola vive in **un solo** posto: le regole operative in `AGENTS.md`, la
  verità di prodotto qui, i dettagli accanto al codice. Altrove si linka.
- Un documento che supera ~10 KB va splittato o dotato di una sintesi in testa
  che permetta di rispondere senza leggerlo tutto.
- Una procedura ripetibile diventa una skill in `.claude/skills/`, non un
  capitolo in più di un documento caricato a ogni sessione.
- Un file annidato di regole (`<dir>/AGENTS.md`) esiste solo se contiene
  qualcosa che non vale al livello superiore.
