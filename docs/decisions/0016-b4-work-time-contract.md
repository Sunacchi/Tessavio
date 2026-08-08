# ADR-0016 — B4 lavoro: piano, consuntivo, pause e report riproducibili

- Status: accepted
- Date: 2026-08-08

## Context

B4 deve rappresentare il lavoro senza confondere ciò che era pianificato con
ciò che è realmente avvenuto. Le pause influenzano il tempo conteggiato secondo
regole dell'utente/contratto, non secondo una costante universale. Turni notturni
e cambi DST rendono errato calcolare durate da sole ore civili o offset fissi.

## Decision

Turni pianificati, consuntivi e pause sono aggregate distinte, private e
user-scoped. Ogni intervallo è semiaperto `[start,end)`, conserva start/end UTC e
timezone IANA originale. Gli input sono date/ore locali complete: gap e fold DST
sono rifiutati con disambiguation `reject`; attraversare mezzanotte o DST è
ammesso e la durata usa gli instant reali. Un intervallo dura al massimo 48 ore.

Una `WorkRule` privata e versionata dichiara per B4 unicamente
`break_treatment = paid|unpaid`. Il consuntivo salva ID, versione, nome e
trattamento come snapshot: i report storici restano riproducibili se una futura
milestone modifica una regola. Una pausa deve essere contenuta nel consuntivo
dello stesso utente e non può sovrapporsi ad altre pause di quel consuntivo.

Il report riceve due date locali inclusive, per massimo 366 giorni civili. I
confini vengono risolti nella timezone profilo e ogni intervallo è clamped alla
finestra. Espone minuti interi pianificati, lordi, di pausa e conteggiati, formula
`work-report-v1`, timezone, snapshot delle regole e ID contributori. Per una
regola `paid`, le pause restano conteggiate; per `unpaid`, sono sottratte. B4 non
calcola denaro, paga, straordinari, maggiorazioni o arrotondamenti contrattuali.
Il repository rifiuta report patologici oltre 500 record per categoria. Per un
report valido, formula e totali sono sempre resi; la presentazione Telegram può
troncare esplicitamente solo il dettaglio dei contributori entro 3.500 caratteri.

Create è l'unica mutation B4. Ogni create attraversa authorization, validazione,
repository user-scoped, audit e Undo atomico/idempotente. I token `wrk_` sono
user-bound, single-use, scadono dopo 15 minuti e verificano la versione. L'Undo
elimina solo l'entità creata; diventa stale se la regola è referenziata o il
consuntivo ha pause, senza cascade implicito. I dati core restano fino alla
cancellazione account; gli Undo scaduti hanno purge bounded user-scoped.

## Consequences

- piano e consuntivo non possono sovrascriversi o masquerarsi a vicenda;
- i totali si possono ricostruire dai record e dagli snapshot conservati;
- la correttezza DST deriva da Temporal e dagli instant, non da 24 ore/giorno;
- quattro tabelle di dominio e un ledger Undo sono più verbosi, ma mantengono FK,
  lifecycle e hot query espliciti;
- nessun nuovo Cron, Queue, Workflow, servizio esterno o dipendenza è necessario.

## Revisit when

B6 introduce ricorrenze/rotazioni, B7 introduce export/report trasversali, E2 usa
i turni come vincoli, F introduce lavoro condiviso oppure una milestone futura
approva regole salariali. Qualunque estensione mantiene snapshot/versione e non
ricostruisce retroattivamente i consuntivi con policy correnti.
