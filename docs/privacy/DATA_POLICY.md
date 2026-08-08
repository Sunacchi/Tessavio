# Data and privacy policy baseline

## Retention proposta

| Dato                     | Default                             |
| ------------------------ | ----------------------------------- |
| audio raw                | eliminato subito dopo STT           |
| immagine raw             | eliminata subito dopo extraction    |
| prompt raw nei log       | disabilitato                        |
| testo normalizzato inbox | 7 giorni per A1                     |
| ActionProposal           | 30-90 giorni                        |
| effect/delivery A1       | 30 giorni                           |
| audit identità A1        | minimo 90 giorni; approvazione prod |
| dati core                | fino a cancellazione utente         |
| metadata AI usage        | quanto necessario a budget e report |

Conservare il risultato utile, non il materiale originale. La persistenza di media è futura, esplicita e opt-in.

In A1 Telegram viene ridotto a update ID, ID numerici necessari, tipo chat,
timestamp e testo del comando. Nome, username e payload raw vengono scartati al
confine. Rate bucket e lease scadono rispettivamente entro due finestre e 30
secondi; user/identity restano fino al futuro percorso di cancellazione account.
La purge periodica dei record a 7/30/90 giorni è un gate pre-beta e non è ancora
una promessa di deploy production.

## Diritti e operazioni

Il prodotto commerciale dovrà supportare accesso, rettifica, export, cancellazione e revoca integrazioni. Export minimo JSON; CSV utile per lavoro, spese, eventi e task.

La cancellazione account richiede conferma, revoca integrazioni, rimozione credenziali e dati attivi, gestione retention infrastrutturale e conservazione del solo audit legalmente necessario.

## Processor map pre-lancio

Documentare categorie di dati e finalità per Telegram, Cloudflare, OpenRouter, provider AI sottostante e Google quando collegato.

## Trasparenza AI

L'onboarding deve dichiarare che modelli AI interpretano alcuni messaggi mentre dati e azioni sono gestiti dal software e controllabili/annullabili. I piani prodotti con AI vanno etichettati come suggerimenti, non decisioni oggettive. La revisione legale resta obbligatoria prima della commercializzazione.
