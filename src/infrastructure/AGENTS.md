# Infrastructure instructions

- Adapters implement ports defined by application/domain layers; do not leak D1, Queue or provider types inward.
- Every tenant repository method requires explicit `UserScope` or `SpaceScope`.
- Use parameterized/prepared statements. SQL hot paths require query-plan evidence and tests.
- Queue messages are versioned and idempotent. Store no raw media in D1.
- Clock and ID generators are injectable for deterministic tests.
- Structured logs use hashes/IDs and codes, never user content or secrets.
