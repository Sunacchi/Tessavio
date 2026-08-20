# src/integrations — regole

Adapter opzionali. Un outage non deve corrompere né disabilitare il core locale.

- Conserva solo gli scope e i token necessari, cifrati e versionati.
- OpenRouter OAuth: PKCE S256 e sessione applicativa opaca monouso; valida
  scadenza e consumo prima dello scambio.
- Google Calendar: prima export-only, poi riconciliazione/import, infine sync
  bidirezionale con gate separato. D1 resta autorevole; mai last-write-wins cieco
  ([ADR-0011](../../docs/decisions/0011-google-calendar-sync-levels.md)).
- **Open Banking vietato:** niente credenziali, provider, adapter, dipendenze o
  schema ([ADR-0009](../../docs/decisions/0009-no-open-banking.md)). L'import CSV
  manuale è un use case di dominio.
- Normalizza i fallimenti esterni nella tassonomia condivisa e distingui
  retryable da permanente.
