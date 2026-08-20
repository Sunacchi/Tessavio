# Milestone corrente — C3 Inbox testuale

**Stato: attiva dal 2026-08-20.** Slice C1.2 chiusa. Il perimetro autorizzato è
C3 come descritto in [phases/c-ai-byok.md](phases/c-ai-byok.md); i confini sono
congelati in [ADR-0026](../decisions/0026-textual-inbox-boundaries.md).

## Risultato atteso

Il testo libero, gli inoltri e i link diventano proposte multi-intent instradate
verso i domini esistenti attraverso il registry di C0. Nessuna entità nuova,
nessuna regola di dominio duplicata.

## Gate di chiusura

- il testo che nessun comando riconosce apre un job solo se l'AI è configurata;
- senza AI il testo libero resta senza risposta, come prima;
- idempotenza per singola proposta, non per messaggio;
- un link non viene mai scaricato: lo verifica un test che sorveglia `fetch`;
- un inoltro ostile non amplia tool, scope o policy;
- `npm run validate` verde.

## Out of scope

- download del contenuto dei link (slice a sé: SSRF, egress, lifecycle del raw);
- media, audio e immagini;
- creazione di risorse Cloudflare remote e deploy.

## Prossima decisione

Con C3 chiusa, la Phase C è completa salvo lo smoke live di C2. La prossima
fase (D o E) si attiva solo con un aggiornamento esplicito di questo file.
