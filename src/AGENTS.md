# src — regole comuni

- Rispetta la direzione delle dipendenze in `docs/architecture/REPOSITORY_STRUCTURE.md`:
  `entrypoints/telegram → application → domains`, con `infrastructure`,
  `integrations` e `ai` dietro le porte.
- TypeScript strict: niente `any`, cast non sicuri o check disabilitati senza un
  motivo di confine documentato in un commento sulla riga.
- Parsa l'input esterno **al confine** (Zod). Le funzioni di dominio ricevono
  tipi già validati, non `unknown`.
- Inietta clock, generatore di ID e adapter dove il determinismo conta.
- Usa la tassonomia errori di `shared/errors.ts` e failure attese in stile
  `Result`; nessuna eccezione di provider risale i layer.
- Propaga il correlation ID; redigi i log (`shared/logger.ts`).
- Budget: oltre 500 righe motiva, oltre 800 splitta prima di aggiungere altro.
- Non creare file per fasi non attive.
