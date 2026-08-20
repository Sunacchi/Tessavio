# migrations — regole

Il database contiene la verità del prodotto: una migration sbagliata non è
reversibile con un revert di codice.

- D1 va creato con giurisdizione **EU** fin dall'origine.
- Ogni cambio di schema è versionato e generato da Drizzle
  (`npm run db:generate`); non modificare mai lo schema di produzione a mano.
- Preferisci migration additive e backward-compatible; documenta la recovery nel
  runbook della slice.
- Ogni tabella tenant ha owner o space scope esplicito e gli indici che lo
  supportano.
- Valida l'unicità su: update ID Telegram, chiavi di dedupe delivery e ogni
  altro confine di idempotenza.
- Prima di un gate: migration test fresh **e** upgrade, test cross-tenant e
  `EXPLAIN QUERY PLAN` sulle query hot.
- `npm run db:check` deve restare verde: schema e migration non divergono.
