# Milestone corrente — Phase C completata

**Stato: chiusa il 2026-08-20.** Le slice G0, C0, C1, C2, C1.2 e C3 sono
implementate, provate e documentate. Nessuna slice è attiva: la prossima si
apre solo con un aggiornamento esplicito di questo file.

## Risultato

Il prodotto interpreta il testo libero e propone azioni che il codice
deterministico valida ed esegue. L'AI è opzionale in senso pieno: senza
variabili `AI_*` il Worker parte, la demo B passa e il testo libero resta senza
risposta. Con una chiave collegata, ogni chiamata passa da budget prenotato,
privacy strict e schema strict, e ogni scrittura passa dallo stesso registry dei
comandi espliciti, con audit, Undo e provenance.

## Gate trasversali chiusi

- nessun percorso privilegiato dall'AI al database: le proposte diventano
  comandi deterministici e passano dal registry di C0;
- policy tabellare provata con property test: mai `execute_with_undo` su una
  classe distruttiva o su più di un'entità;
- idempotenza sotto retry: piano persistito prima dell'esecuzione, ledger
  `effects` per proposta, token di conferma single-use;
- credenziali BYOK cifrate con envelope encryption legata al tenant, revoca che
  cancella il ciphertext, rotazione KEK con decrypt su N-1;
- tre controlli di costo distinti e provati, con recovery delle prenotazioni;
- migration 0009-0011 provate fresh e upgrade;
- `npm run validate` verde: 61 file Vitest, 290 test.

## Cosa resta al proprietario

1. `git push origin main` (il bridge non ha rete);
2. **smoke live OAuth** quando esisterà un host pubblico HTTPS: procedura nel
   [runbook C2](../runbooks/C2_OAUTH_RECOVERY.md), inclusa la generazione della
   KEK e la riverifica dell'appendice A del piano di fase;
3. scegliere la prossima fase: D (media), E1 (planner) o G1 (briefing) — le
   ultime due dipendono solo da B e possono procedere in parallelo.

## Out of scope, per decisione firmata

- modalità AI free/best-effort (G0.2);
- download del contenuto dei link (ADR-0026);
- creazione di risorse Cloudflare remote e deploy.
