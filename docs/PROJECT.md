# Visione e requisiti del prodotto

## Obiettivo

Creare un assistente personale conversazionale usato principalmente in Telegram. Deve comprendere testo, vocali e immagini, ma mantenere nel software un modello affidabile della vita organizzativa dell'utente: eventi, reminder, task, lavoro, spese, liste, routine, spazi condivisi e preferenze.

Esempio di input:

> Domani lavoro 6-14, appena esco devo passare in farmacia e alle 17 ho il dentista. Ricordamelo un'ora prima.

Il sistema deve ricavarne entità distinte e verificabili: turno, task vincolata, evento e reminder. Il testo dell'utente non diventa mai una write diretta.

## Principi di prodotto

1. **Core AI-independent.** Agenda, reminder, task, lavoro, report e comandi espliciti continuano a funzionare durante outage o assenza del provider AI.
2. **Multi-tenant dal giorno 1.** Ogni record appartiene a un utente o a uno spazio; il privato è il default.
3. **BYOK.** In produzione l'utente collega il proprio account AI, principalmente OpenRouter via OAuth PKCE. Il consumo non grava sul proprietario del bot.
4. **AI come interprete.** L'AI formula proposte strutturate; validator, policy e servizi di dominio decidono e applicano.
5. **Privacy by default.** Contesto minimo, raw media transitori, niente prompt logging, ZDR quando compatibile.
6. **Undo e idempotenza.** Retry di Telegram, Queue o provider non producono duplicati; le operazioni reversibili si possono annullare.
7. **Tempo corretto.** Timezone IANA, date locali esplicite e casi DST testati.
8. **Modular monolith.** Un solo prodotto ben modulare, senza microservizi prematuri.
9. **Auditability.** Ogni modifica significativa registra attore, azione, entità, prima/dopo e correlation ID.
10. **Cost awareness.** Ogni operazione AI rispetta capability, privacy, budget utente e costo massimo.

## Esperienza utente

L'interazione è conversation-first. I comandi (`/oggi`, `/domani`, `/task`, `/lavoro`, `/spese`, `/liste`, `/report`, `/impostazioni`, `/privacy`, `/ai`, `/annulla`) sono scorciatoie e fallback deterministici, non l'unico modo di usare il prodotto.

Eseguire direttamente con Undo soltanto azioni semplici, non distruttive e non ambigue. Mostrare preview quando l'azione è distruttiva, bulk, condivisa, incerta o derivata da molti elementi in un'immagine.

## Moduli

- Smart Inbox e command dispatch;
- agenda, eventi e reminder;
- task e planner;
- turni pianificati e consuntivi separati;
- spese in unità minori intere;
- liste e routine;
- spazi condivisi con ruoli;
- report deterministici con narrazione AI opzionale;
- allegati transitori;
- AI router e integrazioni;
- privacy/account/admin.

## Scope iniziale

La V3 definisce la destinazione architetturale, non autorizza a implementare tutto insieme. La sequenza vincolante è descritta in `docs/planning/ROADMAP.md`; la sola fase attiva è in `docs/planning/CURRENT_MILESTONE.md`.

## Non-obiettivi iniziali

- pagamenti e billing commerciale;
- Google Calendar two-way sync;
- microservizi o sharding;
- archivio permanente di audio, immagini o documenti;
- habit tracker completo;
- workflow Cloudflare per l'MVP;
- modelli AI hardcoded o managed AI plan.

## Provenienza

Sintesi operativa della specifica `Progetto_Assistente_Personale_Telegram_V3_2026.txt`, versione 1.0, verificata il 2026-08-08. Le informazioni temporali su versioni, prezzi, quote, normativa e provider devono essere ricontrollate prima di dipendere da esse.
