# Orchestrazione dev-only

## Codex nativo

Gli agenti custom sono definiti in `.codex/agents/`. Codex può combinarli con gli `AGENTS.md` dalla radice verso la directory corrente. Le istruzioni più vicine prevalgono; mantenere il file root sotto il limite predefinito e spostare dettagli specialistici nei file annidati.

Esempio di richiesta:

```text
Implementa la vertical slice foundation. Delega a cloudflare_worker il transport,
a domain_worker il caso d'uso deterministico e a data_security_reviewer una review
read-only dopo le modifiche. Evita scritture concorrenti sugli stessi file, attendi
tutti e integra i risultati contro la Definition of Done.
```

## Ruflo

Ruflo non fa parte del bot. Un'eventuale configurazione deve:

- usare l'adapter Codex;
- essere minima e project-scoped;
- fissare ogni versione esattamente dopo verifica;
- persistere lo stato del loop in un percorso locale esplicito;
- definire massimo numero di iterazioni, timeout e condizioni di successo/fallimento;
- evitare template `full` e tool non necessari;
- non leggere o propagare segreti.

Non creare la configurazione fino a quando una task non richiede il loop. Registrare allora comandi, versioni e rollback in un runbook.

## Graphify

Prima esecuzione consentita: dopo `A1 Foundation vertical slice`. Esecuzioni successive: fine milestone o refactor sostanziale. Salvare solo output utili alla decisione; non aggiungerlo al normale test loop.
