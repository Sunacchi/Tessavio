# Integration instructions

- Integrations are optional adapters; outages must not corrupt or disable the local core.
- Store only required scopes/tokens, encrypted and versioned.
- OpenRouter OAuth uses PKCE S256 and a one-time opaque application session; validate expiry and consumption before exchange.
- Google Calendar starts export-only and never becomes the source of truth. Do not implement blind last-write-wins.
- Normalize external failures into the shared taxonomy and distinguish retryable from permanent.
