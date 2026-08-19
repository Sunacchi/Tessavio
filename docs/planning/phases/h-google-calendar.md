# Phase H — Google Calendar a livelli

> Stato: **non attiva**. Livelli H1/H2/H3 in [ADR-0011](../../decisions/0011-google-calendar-sync-levels.md).

## H1 — Collegamento ed export controllato

- [ ] applicare ADR-0011: D1 autorevole, mapping stabile e niente last-write-wins;
- [ ] richiedere scope OAuth minimi e sessioni state/PKCE opache, one-time e sicure;
- [ ] cifrare/versionare token e supportare revoca/disconnessione;
- [ ] modellare account, calendario scelto e mapping local/external ID sempre
      tenant/account/calendar scoped;
- [ ] registrare outbox nello stesso boundary della mutation locale e applicare
      create/update/delete idempotenti fuori dalla transazione;
- [ ] classificare retry/permanent failure e mostrare `pending/exported/failed`;
- [ ] gestire delete, token revocato, 429, partial batch e send ambiguo;
- [ ] testare tutto con adapter fake, senza credenziali reali;
- [ ] chiudere H1 dimostrando che outage Google non blocca o corrompe il core.

## H2 — Riconciliazione e import

- [ ] implementare cursor/channel lifecycle, rinnovo e recovery senza fidarsi di
      payload o ID esterni non scoped;
- [ ] rilevare create/update/delete Google e registrare divergenze/tombstone;
- [ ] mappare timezone, all-day e ricorrenze senza perdita semantica;
- [ ] trasformare un cambiamento esterno in staging/proposta validata, non in
      sovrascrittura automatica ambigua;
- [ ] aggiungere riconciliazione full bounded per cursor perso o mapping divergente;
- [ ] testare reorder, duplicate, cursor expiry, delete concorrente e cross-tenant.

## H3 — Sincronizzazione bidirezionale

- [ ] definire policy conflitto per versione/campo e casi auto-merge vs preview;
- [ ] applicare le modifiche importate attraverso authorization, idempotenza,
      domain service, audit e Undo applicabile;
- [ ] impedire loop echo con origin/version/effect key stabili;
- [ ] mostrare conflitti risolvibili senza esporre dettagli nei log;
- [ ] testare race locale/Google, replay, ricorrenze, all-day, loop prevention,
      revoca durante sync e recovery dopo partial failure;
- [ ] validare ogni migration H fresh/upgrade/N-1 e il runbook di riconciliazione.
