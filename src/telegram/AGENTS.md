# Telegram adapter instructions

- Use Telegram numeric `user_id` only as external identity; map it to internal `user_id` before domain work.
- Never use phone number or username as identity.
- Verify webhook secret and validate the update structure.
- Build messages and inline keyboards as presentation adapters; callback payloads are untrusted, short-lived and user-bound where applicable.
- Keep commands as deterministic shortcuts and graceful-degradation paths.
- Never request or accept provider API keys through chat.
