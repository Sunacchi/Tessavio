# Application-layer instructions

- Orchestrate use cases in this order: identity -> authorization -> idempotency -> validation/policy -> domain -> persistence -> audit/undo -> notification.
- AI-derived changes enter only as `ActionProposal[]`; validate schema, scope, permissions, dates, duplicates, conflicts, ranges, budget and destructive/bulk status.
- Ask for preview on ambiguous, destructive, bulk or shared actions. Simple unambiguous non-destructive actions may execute with Undo.
- A provider retry must not re-execute domain writes.
- Do not embed Telegram presentation details or provider-specific model names.
