# src/infrastructure — regole

Adapter che implementano le porte definite da application e domains.

- Non far risalire tipi D1, Queue o di provider verso l'interno.
- **Ogni** metodo di un repository tenant-scoped riceve `UserScope` o
  `SpaceScope` esplicito. Una query per ID nudo è un finding P0.
- Statement preparati/parametrizzati sempre. Le query hot richiedono evidenza di
  `EXPLAIN QUERY PLAN` e un test.
- I messaggi di Queue sono versionati e idempotenti. In D1 non finisce raw media.
- Clock e generatori di ID iniettabili per test deterministici.
- Log strutturati con hash, ID e codici; mai contenuto utente o segreti.
- I repository stanno crescendo oltre il budget: quando ne tocchi uno oltre le
  800 righe, estrai il mapper delle righe o le query di Undo prima di aggiungere
  un metodo (ADR-0022).
