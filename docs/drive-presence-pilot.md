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


## Seconda prova: lettura per righe e celle

Sul foglio del 13 novembre sono state eseguite 23 conversioni Google Drive: 13 ritagli di riga (giorni 1-13) e 10 composizioni delle celle (giorni 2-6, 9-13). Tutte completate, con documenti temporanei cestinati. Il PDF originale è stato renderizzato a dimensione massima 1800 pixel. I ritagli sono stati scelti e controllati manualmente su questa pagina: non costituiscono una prova di individuazione automatica della griglia o del giorno. Nessun numero è stato ridisegnato o corretto prima dell'OCR. Le celle sono state ingrandite e separate da spazi bianchi, escludendo i bordi. Risultati grezzi: `tests/fixtures/drive-presence-pilot-rows.json`.

### Riscontri

- Riga 2, celle separate: Google restituisce `12`, `30`, `17`, `50`, `5 20`. La lettura coincide con il controllo visivo: 12:30-17:50, 320 minuti. Il turno nell'app è 14:00-18:00 e il supplementare registrato è 80 minuti: 240+80=320. Coerenza limitata al totale, non conferma dell'orario contrattuale effettivamente svolto.
- Riga 10: totale `5.20` riconosciuto, ma gli orari sono incompleti nella lettura per celle. Non promossa a riga affidabile per sola compatibilità con i dati dell'app.
- Riga 13: `FERIE` riconosciuto sia nel ritaglio di riga sia in quello della nota. Nel database daily_presence non è presente una giornata per il 13 novembre. È una proposta di controllo per l'amministratore, non un'assenza inserita automaticamente né una conferma dell'autorizzazione ferie.
- Altre righe: errori quali `74` per `14`, `78` per `18`, `h.00` per `4.00`; il ritaglio completo può introdurre `1` dai bordi (`15.20` invece di `5.20`). Le date delle righe vuote non vengono interpretate come zero o riposo.
- La lettura per celle riconosce i totali di alcune giornate, ma non produce tutte le fasce coerenti. Nessuna percentuale di accuratezza generalizzabile da questo singolo foglio e dai ritagli manuali.

### Esito operativo

Nessuna scrittura di presenze/budget, nessuna notifica inviata, nessuna automazione di upload abilitata. L'endpoint consente solo a un amministratore attivo di fornire ritagli PNG di prova, associati al documento dell'unico lavoratore pilota; restituisce esplicitamente `inputMode: manual_crop` e `dayVerified: false`. L'accesso temporaneo usato per le prove è rimosso dopo l'esecuzione. Prima dell'importazione automatica servono una griglia rilevata automaticamente, controlli per giorno/cella e risultati affidabili su più documenti. Drive da solo, in questa prova, non soddisfa ancora tale requisito.

## Prova assistita disponibile nell’app — versione 9.29

La nuova sezione amministrativa **Confronto fogli OCR** è limitata a Donatello Annunziata. Si apre anche dal pulsante **Confronta ore · prova OCR** nel visualizzatore dei suoi fogli. Nessun cambiamento al flusso di caricamento del lavoratore e nessuna elaborazione in background dei nuovi upload.

Flusso: scelta del mese e del foglio, rendering PDF (pagina selezionabile) o immagine, ricerca di 32 linee per 31 giornate, correzione di orientamento/inclinazione e limiti, controllo umano della corrispondenza dei giorni, lettura di una riga o del periodo, confronto con app e budget, correzione dei campi e conferma esplicita della singola giornata. I campi usano ore:minuti (anche `5.20` = 5h20), mentre il database conserva minuti interi. Nessuna cifra viene corretta automaticamente in base al turno. La ripartizione di una giornata su più sedi viene segnalata: la conferma pilota sostituisce la giornata con l’unica sede selezionata.

La griglia è un candidato da controllare, non una certificazione delle date. Sul PDF reale del 13 novembre il rilevamento automatico trova il bordo superiore del giorno 1 a y=524 e quello inferiore del giorno 31 a y=1364 sul rendering 1273×1800. Sono disponibili regolazioni manuali se la griglia non viene riconosciuta. La composizione con etichette delle singole celle mantiene separate le due possibili fasce orarie; i risultati ambigui restano da verificare. Le nuove prove Google su righe composte dei giorni 10 e 13 confermano che le cifre possono ancora essere sbagliate o spostate tra campi; il 13 viene riconosciuto come FERIE. Non è stata dimostrata affidabilità sufficiente per l’importazione automatica.

`confirm_drive_presence_pilot` è SECURITY INVOKER, limitata ad amministratori attivi e all’account pilota, con RLS e audit esistenti. Verifica documento/giorno, precedenza del definitivo e delle sostituzioni, versione della dichiarazione, del turno e della giornata budget. L’inserimento sostituisce la singola registrazione, senza aggiungere ore duplicate. Per i record letti il confronto viene invalidato se i dati cambiano. La funzione privata di lock è limitata allo stesso lavoratore e richiede un amministratore; non restituisce dati e non amplia i permessi di aggiornamento delle dichiarazioni.

Le future dichiarazioni del lavoratore non sovrascrivono le giornate annotate `OCR assistito`: viene utilizzato il normale percorso di notifica amministrativa delle presenze. La schermata confronta nuovamente i dati quando viene riaperta e controlla cambiamenti mentre è aperta. Non sono stati introdotti avvisi OCR automatici alla ricezione di ogni nuovo foglio: questa fase rimane assistita.

Validazione: 8 test del parser/calcolo/griglia e regressione push superati; test DOM con dati sintetici per apertura griglia, 5 date del periodo, ingrandimento, lettura senza scritture, conferma e pulizia al logout; SQL con rollback per salvataggio, rifiuto di mancata conferma, dichiarazione obsoleta, doppio salvataggio obsoleto e accesso lavoratore, protezione da riacquisizione e notifica dopo modifica successiva. Tutte le scritture di integrazione sono state annullate. Nessuna prova visiva completa su telefono reale.
