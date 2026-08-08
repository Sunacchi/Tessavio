# Test instructions

- Tests must prove behavior, not implementation trivia.
- Unit: date/time helpers, recurrence, work calculations, money, permissions, budget and validators.
- Integration: webhook/Queue/D1, reminder/briefing Cron and delivery, outbox,
  provider mocks, OAuth and Google export/reconciliation/two-way conflict flows.
- Security: cross-user read/write denial, role denial, forged/reused callback,
  duplicate update, hostile document/prompt injection, and secret-log scanning.
- Property tests: temporal intervals/DST, recurrence, money and planner overlap invariants.
- Use fake clocks, deterministic IDs and sanitized fixtures. Never use production tokens or personal data.
- Every bug fix includes a failing regression test first when practical.
- Open Banking is excluded; test scans should reject banking adapters, secrets,
  schema or dependencies rather than scaffold a fake provider.
