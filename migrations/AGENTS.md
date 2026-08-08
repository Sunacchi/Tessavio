# Migration instructions

- D1 must be provisioned with EU jurisdiction from creation.
- All schema changes are versioned; never edit production schema manually.
- Prefer additive/backward-compatible migrations and document recovery.
- Every tenant table has explicit owner or space scope and supporting indices.
- Validate uniqueness for Telegram update IDs, delivery dedupe keys and other idempotency boundaries.
- Run migration validation, cross-tenant tests and `EXPLAIN QUERY PLAN` for hot queries before beta.
