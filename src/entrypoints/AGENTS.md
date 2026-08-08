# Entrypoint instructions

- Entrypoints translate Cloudflare events and delegate; they do not hold business logic.
- `fetch`: POST-only for webhook routes, validate Telegram secret before parsing sensitive work, dedupe and enqueue, then return quickly.
- `queue`: validate a versioned envelope, preserve correlation/idempotency keys, classify retryable errors and acknowledge only completed/permanent work.
- `scheduled`: claim due rows atomically and enqueue; never deliver notifications directly.
- Do not call AI from the webhook or scheduled handler.
