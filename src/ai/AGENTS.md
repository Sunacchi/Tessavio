# AI instructions

- This area is inactive until Phase C unless the current task explicitly defines an interface seam.
- AI is optional and provider-agnostic. Domain and application core must compile and operate without a configured provider.
- Require strict structured outputs and validate them server-side. Never parse free prose into database operations.
- Never give a model SQL, repository access, credentials or broad user history.
- Minimize context to the requested time/entity window; default privacy is strict and prompt logging is off.
- Models, fallbacks, capability, benchmark score, privacy and cost live in configuration.
- Fallback only to compatible models with equal-or-better privacy under the operation cost cap.
- Any prompt/schema/model change updates fixtures and benchmark results before promotion.
