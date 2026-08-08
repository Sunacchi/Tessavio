# Domain instructions

- Domain code is deterministic and independent of AI, Cloudflare, Telegram, D1, Drizzle and Hono.
- Represent money as integer minor units and currency explicitly.
- Preserve local date semantics, timezone IANA and UTC instants; never encode a timezone as a fixed offset.
- Separate planned work shifts from actual work logs. Work/pay rules are data-driven, not universal constants.
- The planner may consume normalized constraints but allocates and checks conflicts deterministically.
- Every mutation contract includes actor/scope, idempotency key and audit metadata; reversible changes produce Undo data.
