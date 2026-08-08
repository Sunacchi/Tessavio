# Protocollo di handoff

## Formato

```md
Esito: completato | parziale | bloccato

Modifiche:

- file e motivazione.

Verifiche:

- comando: esito.

Evidenze:

- file/simbolo o scenario riproducibile.

Rischi residui:

- rischio, impatto, mitigazione proposta.

Decisioni richieste:

- domanda concreta al main agent, oppure “nessuna”.
```

## Regole

- Non incollare log estesi: sintetizzare e indicare il comando.
- Non nascondere test non eseguiti o failure preesistenti.
- Non presentare ipotesi come difetti confermati.
- Se sono state fatte write, elencare tutti i file toccati e verificare conflitti prima del handoff.
- Non includere segreti o dati personali, anche se presenti nell'ambiente.
