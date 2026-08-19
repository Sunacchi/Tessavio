# src/telegram — regole

- Il `user_id` numerico di Telegram è **solo** identità esterna: mappalo a un ID
  interno prima di qualunque lavoro di dominio.
- Numero di telefono e username non sono chiavi identitarie.
- Verifica il secret del webhook e valida la struttura dell'update (`schemas.ts`).
- Messaggi e tastiere sono adapter di presentazione: il payload di una callback è
  non fidato, di breve durata e legato all'utente dove applicabile.
- I comandi restano scorciatoie deterministiche e percorso di degrado quando
  l'AI o un'integrazione non è disponibile.
- Non chiedere e non accettare mai chiavi API di provider dentro la chat.
