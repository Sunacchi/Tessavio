# Integration instructions

- Integrations are optional adapters; outages must not corrupt or disable the local core.
- Store only required scopes/tokens, encrypted and versioned.
- OpenRouter OAuth uses PKCE S256 and a one-time opaque application session; validate expiry and consumption before exchange.
- Google Calendar starts export-only, then adds reconciliation/import and a
  separately gated two-way sync; D1 remains authoritative. Never use blind
  last-write-wins.
- Do not add Open Banking credentials, providers, adapters, dependencies or
  schema. Manual CSV import is a domain use case, not a banking integration.
- Normalize external failures into the shared taxonomy and distinguish retryable from permanent.
