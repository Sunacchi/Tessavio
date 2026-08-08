# Security instructions

- Treat authorization, encryption, privacy and rate limiting as mandatory application boundaries.
- Every shared write verifies membership, role and resource scope.
- Use Web Crypto primitives correctly; AES-GCM nonces must be unique. Prefer envelope encryption for user credentials and include credential versioning.
- OAuth state/session is opaque, random, one-time, user-bound and short-lived; PKCE uses S256.
- Do not log or return secret material. Hashes do not replace encryption for reusable credentials.
- Changes require negative tests for bypass, replay, reuse and leakage.
