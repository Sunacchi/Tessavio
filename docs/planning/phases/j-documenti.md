# Phase J — Documenti, amministrazione e persone

> Stato: **non attiva**. Prodotto esteso, una vertical slice per volta. Dipende
> da B (entità collegabili), da D3 (estrazione da documenti) e, per J2, dalla
> cifratura introdotta in [C2.2](c-ai-byok.md#c22--envelope-encryption-delle-credenziali).
> Impegno di prodotto, non autorizzazione a implementare.

## Outcome per slice

| Slice  | Outcome                                                                         |
| ------ | ------------------------------------------------------------------------------- |
| **J1** | registro documenti: categorie, scadenze, reminder e ricerca sui metadata        |
| **J2** | separazione fra raw transitorio, estratto con provenance e originale archiviato |
| **J3** | persone interne: compleanni, anniversari, ultime interazioni, note              |
| **J4** | follow-up: cose da chiedere, promesse, regali, oggetti e denaro prestati        |

## Il punto che decide la fase

**J2 è il primo posto in cui Tessavio conserva davvero un contenuto.** Fino a
qui l'invariante 6 dice che audio e immagini si eliminano dopo l'elaborazione, e
D lo rispetta non persistendo affatto. J2 è l'eccezione che l'invariante stesso
prevede — "conservare un originale richiede use case esplicito, cifratura,
authorization e retention" — e va costruita come tale, non come un effetto
collaterale dell'estrazione.

Le tre cose restano separate e non si confondono mai:

| Cosa                 | Dove vive                           | Quanto dura                   |
| -------------------- | ----------------------------------- | ----------------------------- |
| raw dell'Inbox       | memoria della singola invocazione   | l'elaborazione (D)            |
| estratto             | dominio, con provenance per campo   | come l'entità che lo contiene |
| originale archiviato | solo se l'utente lo chiede, cifrato | retention esplicita           |

## Confini

- **Nessuna tabella polimorfa universale.** I collegamenti fra documento ed
  entità sono riferimenti tipizzati, autorizzati su **entrambe** le risorse e
  scoped: un "allegabile a qualsiasi cosa" anticipato oggi diventa il buco di
  authorization di domani.
- **Una sola categoria iniziale** in J1, poi estensione. Non si progetta un enum
  rigido di categorie prima di sapere quali servono davvero.
- **J3 e J4 non sono un CRM.** Nessuna pipeline, nessun punteggio, nessuna
  automazione commerciale.
- **J4 non muove denaro**: prestiti e debiti sono registrazioni
  ([ADR-0009](../../decisions/0009-no-open-banking.md)).

## Decisioni da prendere prima

- [ ] categoria iniziale di J1 e criterio per aggiungerne;
- [ ] se J2 archivia davvero, e con quale retention e quale costo di storage;
- [ ] chiave e rotazione per i documenti archiviati: stesso envelope di C2.2 o
      una gerarchia separata per contenuto voluminoso;
- [ ] cosa succede a un documento collegato quando l'entità collegata viene
      cancellata.

## Rischi principali

| Rischio                                         | Mitigazione                                               |
| ----------------------------------------------- | --------------------------------------------------------- |
| L'archivio nasce per inerzia dall'estrazione    | J2 è uno use case esplicito, con la sua conferma utente   |
| Tabella polimorfa che aggira l'authorization    | riferimenti tipizzati, autorizzati su entrambe le risorse |
| Link orfani dopo la cancellazione di un'entità  | comportamento deciso prima, non dedotto                   |
| Documenti sensibili trattati come dati ordinari | classificazione sensibile e retention dedicata            |
| Estrazione errata accettata senza revisione     | provenance per campo e correzione mirata                  |

## Criteri di uscita

- [ ] raw, estratto e originale archiviato sono distinti e provati come distinti;
- [ ] l'archiviazione è sempre un'azione esplicita dell'utente, mai un default;
- [ ] cifratura, authorization e retention dell'archivio verificate come in C2;
- [ ] ricerca e cancellazione funzionano sui metadata senza esporre contenuto;
- [ ] reminder di scadenza documento non duplicano notifiche;
- [ ] link cross-domain autorizzati su entrambe le risorse, con test negativo;
- [ ] test cross-tenant su documenti, persone e follow-up;
- [ ] `npm run validate` verde e matrice `/dod` compilata per ogni slice.
