# benchmark — regole

Area attiva dalla Phase C. Non scegliere un modello per impressione.

- Dataset: parsing italiano, multi-intent, date ambigue, turni, immagini e
  screenshot, casi del planner ed edge case.
- Metriche: validità dello schema, azione esatta, accuratezza data/ora, tasso di
  azioni false, recall multi-intent, latenza, costo e tasso di fallback.
- Ottimizza l'estrazione per accuratezza, non per eloquenza; il planner per
  rispetto dei vincoli e utilità; la vision per precisione dell'estrazione.
- Promuovi un cambio di modello, prompt o schema solo dopo benchmark e canary
  controllato.
- Fixture sintetiche o con consenso, prive di segreti e dati personali.
