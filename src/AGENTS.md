# Source instructions

- Respect the dependency direction in `docs/architecture/REPOSITORY_STRUCTURE.md`.
- Keep TypeScript strict; do not bypass errors with `any`, unsafe casts or disabled checks without a documented boundary reason.
- Parse all external input at the edge. Domain functions receive validated types.
- Inject clock, ID generation and adapters where determinism matters.
- Use the shared error taxonomy and `Result`-style expected failures; do not leak provider exceptions to users.
- Preserve correlation IDs and redact logs.
- Do not add source files for future phases unless required by the active milestone.
