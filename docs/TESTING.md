# Strategia di test

La suite prova comportamento e invarianti, non solo funzioni isolate. Una
feature è “presente” nella matrice requisiti soltanto quando i gate pertinenti
della Definition of Done hanno evidenza eseguibile.

## Livelli

- **Unit:** regole pure, parser bounded, validator, policy, calcoli e rendering.
- **Property:** tempo/DST/recurrence, minor unit/split, planner, dedupe e
  convergenza sync.
- **Integration:** migration reali D1, repository scoped, Queue/Cron/outbox,
  adapter fake e recovery dei crash window.
- **Security:** cross-tenant/role denial, replay, prompt injection, file ostili,
  credential/log leakage e cancellazione concorrente.
- **Contract:** Telegram, provider AI e Google Calendar con fixture sintetiche e
  versionate; nessuna credenziale reale.
- **End-to-end:** una vertical slice dalla richiesta alla risposta, incluse
  audit/Undo, failure e recovery.

## Matrice minima per area

| Area            | Evidenze obbligatorie                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbox           | normalizzazione per tipo, provenance minima, multi-intent, ambiguity question, proposal dedupe, nessuna write AI diretta                                         |
| Tempo           | timezone IANA, date-only, DST gap/fold, mezzanotte, all-day e recurrence                                                                                         |
| Finanze         | minor unit, valuta, split con somma esatta, periodi, import CSV duplicate/rollback, forecast provenance/disclaimer                                               |
| Documenti/media | allowlist e limiti, parser failure/timeout, prompt injection, extraction provenance, cleanup verificato, access/delete cross-tenant                              |
| Planner         | overlap, precedenze, hard/soft constraint, carico, risultato impossibile/parziale, stale preview e Undo                                                          |
| Sharing         | private-by-default, role downgrade, invite replay, space mismatch, ultimo owner e risorsa privata invisibile                                                     |
| Briefing        | quiet hours, preferenze, dedupe logica, contributor failure, testo non sensibile/non ansiogeno e nessuna ripetizione                                             |
| Google          | OAuth replay/PKCE, mapping scoped, outbox retry, create/update/delete duplicate, revoke, all-day/timezone/recurrence, reconciliation, conflict e loop prevention |
| Benessere       | nessuna dose/diagnosi inventata, reminder user-authored, privacy, quiet hours e adattamento opt-in revisionabile                                                 |
| Export/delete   | completezza, scope, provenance, revoca, purge idempotente, tombstone anti-resurrection e job pendenti                                                            |

## Fixture e dati

Usare nomi, documenti, ricevute, voci e immagini sintetici. Vietati token reali,
dati personali copiati, dump e credenziali. Le fixture avversariali possono
contenere istruzioni malevole ma non segreti. Benchmark e contract fixture
registrano versione di schema/prompt/provider senza hardcodare la policy di
modello nel dominio.

## Regole per le integrazioni

Google Calendar si testa prima con adapter fake controllabile: timeout, 401/403,
429, partial batch, token revocato, cambio cursor, delete/tombstone e modifiche
concorrenti. I test devono dimostrare che un outage non modifica la verità D1 e
che un replay non crea loop o seconde mutation. Un smoke con credenziali reali è
manuale, isolato e non necessario alla suite automatica.

Le integrazioni differite non ricevono fake adapter o contract test prima della
milestone autorizzata. Open Banking non riceve alcun test adapter: uno scan di
schema/dipendenze/documenti deve invece impedire che venga introdotto.

## Comandi e gate

Durante la foundation il gate completo è:

```powershell
npm run validate
```

Ogni slice aggiunge il test mirato più vicino al failure mode modificato e poi
riesegue format check, lint, typecheck, migration check, unit, integration,
security e dry-run build. Phase C+ aggiunge benchmark smoke; fasi temporali,
finanziarie, recurrence e planner aggiungono property test.

## Tracciabilità

Per ogni milestone chiusa aggiornare:

1. requisito e acceptance criterion nella roadmap/matrice;
2. test o evidenza con nome stabile;
3. migration/recovery e query-plan evidence quando applicabili;
4. finding residui con owner e decisione;
5. stato solo dopo la firma dei gate DoD.
