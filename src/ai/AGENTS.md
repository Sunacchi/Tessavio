# src/ai — regole

Area **inattiva** fino alla Phase C, salvo un seam esplicitamente assegnato dalla
task corrente.

- L'AI è opzionale e provider-agnostic: dominio e application compilano e
  funzionano senza provider configurato.
- Output strutturati strict, rivalidati lato server. Non trasformare mai prosa
  libera in operazioni di database.
- Mai dare a un modello SQL, accesso ai repository, credenziali o cronologia
  utente ampia.
- Contesto minimo alla finestra temporale/entità richiesta; privacy strict per
  default e prompt logging disattivato.
- Modelli, fallback, capability, punteggio di benchmark, privacy e costo vivono
  in configurazione versionata.
- Fallback solo verso modelli compatibili, con privacy uguale o migliore e sotto
  il tetto di costo dell'operazione.
- Ogni cambio di prompt, schema o modello aggiorna fixture e benchmark **prima**
  della promozione.
