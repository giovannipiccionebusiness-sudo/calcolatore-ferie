# Prova OCR Google Drive — 13 novembre 2026

Prova limitata all'account di Annunziata Donatello (N153), senza inserimenti né modifiche a presenze, budget, documenti applicativi e notifiche. Nessuna elaborazione automatica dei nuovi caricamenti è abilitata.

## Esecuzione

La funzione `drive-presence-pilot` accetta POST con `{documentId}` da amministratore attivo autenticato. Il documento deve appartenere all'account pilota e alla categoria presenze, con fase weekly, replacement o final. Legge la copia originale archiviata su Drive, verifica hash e dimensione, la converte in Google Docs con `ocrLanguage=it`, esporta il testo e cestina il documento temporaneo. Non modifica l'originale. Restituisce `mode: preview_only`, il testo OCR e lo stato della pulizia. Le credenziali Drive restano sul server.

## Risultati osservati

- Foglio settimanale del 6 novembre, documento `e210b526-37cd-4ffe-a706-6f7e028bf16d`: conversione riuscita, documento temporaneo cestinato. Alcuni totali leggibili (`5.20`, `4.00`); sequenze orarie accorpate e cifre errate, per esempio `7800`. Associazione giorno/ore non affidabile.
- Foglio settimanale del 13 novembre, documento `ece264ac-6624-4957-8635-53eba15f1672`: conversione riuscita, documento temporaneo cestinato. Riconosciuti diversi orari, totali e `FERIE`, ma righe accorpate e posizione del giustificativo non garantita.
- Nell'app esistono registrazioni giornaliere dal 2 al 12 novembre (giorni lavorativi), con 80 minuti supplementari il 2 e il 10. Questo non costituisce una conferma del foglio: manca una lettura OCR affidabile per data.

Nessun tasso di accuratezza calcolabile e nessuna incongruenza confermata automaticamente da questi risultati. Un totale isolato non può essere attribuito a un giorno per sola posizione nel testo esportato. `5.20` in un foglio orario va interpretato come 5 ore e 20 minuti solo dopo avere riconosciuto il formato; non come 5,20 ore decimali.

## Passo successivo

Raddrizzare la pagina, individuare la griglia, estrarre giorno/orari/totale per singola riga e confrontare con una trascrizione verificata visivamente. Conservare separati dato OCR, proposta e dato effettivo. Il confronto con l'app deve distinguere totale lavorato, ordinario, supplementare e giustificativo; la mancanza di una lettura non equivale a zero. Prima della prova di scrittura servono anche controllo versioni, precedenza del definitivo, protezione dalle duplicazioni e verifica delle modifiche successive nell'app.

## Controlli

Richiesta senza accesso rifiutata (401); documento fuori dall'account pilota/non disponibile rifiutato (404). Accesso temporaneo di esecuzione rimosso dopo le prove: la versione finale richiede sempre un amministratore attivo. Nessun pulsante UI né pianificazione aggiunti.
