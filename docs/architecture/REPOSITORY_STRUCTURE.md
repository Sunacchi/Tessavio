# Struttura del repository

```text
.
|-- .codex/
|   |-- config.toml
|   `-- agents/
|-- src/
|   |-- entrypoints/
|   |-- telegram/
|   |-- domains/
|   |-- ai/
|   |-- application/
|   |-- integrations/
|   |-- infrastructure/
|   |-- security/
|   `-- shared/
|-- migrations/
|-- tests/
|-- benchmark/
|-- docs/
|   |-- agents/
|   |-- architecture/
|   |-- decisions/
|   |-- planning/
|   |-- privacy/
|   `-- runbooks/
|-- scripts/
|-- AGENTS.md
|-- README.md
`-- SECURITY.md
```

## Regole di dipendenza

```text
entrypoints/telegram -> application -> domains
                              |          ^
                              v          |
                    ports/interfaces ----+
                              |
                              v
             infrastructure/integrations/ai
```

- `domains` non importa Cloudflare, grammY, Hono, Drizzle o SDK provider.
- `application` dipende da porte e tipi di dominio; non da dettagli HTTP.
- adapter esterni traducono errori in tassonomia condivisa e non espongono payload sensibili.
- `security` è chiamato dal livello applicativo prima di repository o mutazioni.
- test unitari seguono i moduli; integration/e2e/security vivono nelle directory dedicate.

Le sottodirectory ricevono un `AGENTS.md` solo quando hanno regole specialistiche utili. Codex combina le istruzioni dalla radice alla directory corrente; il file più vicino prevale.
