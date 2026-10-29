# Carica per un collega — versione 65

## Uso
L’amministratore apre Gestione → Gestione lavoratori, seleziona «Consenti caricamento presenze per colleghi della stessa sede» e salva il profilo. L’opzione è inizialmente falsa per tutti. Il lavoratore deve aggiornare il profilo riaprendo l’app/accesso. Solo allora compare un nuovo pulsante «Carica per un collega», aggiunto senza sostituire i pulsanti personali.

La finestra dedicata propone soltanto i colleghi correnti della stessa sede fisica N153: account attivi o persone importate dai report non ancora registrate. La sede datata del budget prevale sulla sede corrente nel profilo, se disponibile. Per colleghi senza account serve un’assegnazione budget attuale. In questa versione si inviano solo fogli presenze settimanali e definitivi; nessuna richiesta di assenza o documento sanitario.

Scelta destinatario, mese, venerdì (per il settimanale), fotocamera esistente o galleria/PDF, conferma esplicita del nome e invio. Un foglio già presente richiede conferma di sostituzione; il definitivo richiede la conferma di completezza mensile. La finestra conserva una bozza IndexedDB separata da quella personale, con possibilità di ripresa o annullamento. Le credenziali non vengono persistite nella bozza. Nessuna consultazione dell’archivio altrui: il mittente riceve soltanto la ricevuta dell’invio.

## Attribuzione e Drive
Il documento registrato usa worker_id del destinatario registrato, mai del mittente; submitted_by/submitted_name registrano chi invia. Per persone senza account si usa recipient_person_key e un identificativo di archiviazione stabile, senza creare profili fittizi. Il nome destinatario è una fotografia al momento dell’invio. L’amministratore vede destinatario e mittente nella lista mensile. La verifica del documento e le autorizzazioni esistenti rimangono inalterate.

La coda Drive già esistente viene creata dal trigger di inserimento documento. Drive v10 cambia solo la risoluzione di nome/identificativo del destinatario: stessa radice, CDC, persona, anno, Presenze settimanali/Presenze definitive, mese. Per account esistenti le chiavi di cartella restano invariate. Per un non registrato si usa una chiave stabile dedicata; dopo collegamento HR si riusa quella se non esiste già una cartella dell’account. Se entrambe preesistono, si conserva quella dell’account per gli invii successivi e non si spostano automaticamente gli archivi storici.

Il controllo ore seleziona i fogli non registrati per recipient_person_key, evitando di mescolare documenti con worker_id nullo. Il database verifica anche la corrispondenza del foglio con la persona scelta per la registrazione ore. I documenti storici di chi non aveva account restano visibili all’amministratore; l’archivio personale corrente continua a usare worker_id.

## Controlli
Edge Function colleague-upload autentica ogni richiesta via getUser e non accetta actor dal client. RPC invoker e tabella intent accessibili solo al service role; autenticati/anonimi non possono consultarli. Directory e sede sono ricontrollate durante la preparazione e finalizzazione. URL firmato solo per l’oggetto destinatario/periodo/UUID previsto. Dimensione, MIME e firma del file sono controllati; limite 12 MB. Fotocamera e file personali non vengono modificati.

Finalizzazione con blocco della richiesta e del periodo, controllo duplicati concorrenti, idempotenza per UUID, audit del mittente, protezione immutabile dell’attribuzione. Nessun ampliamento delle policy di lettura dei documenti o dello Storage. worker_id ora ammette NULL esclusivamente in presenza di recipient_person_key; l’inserimento diretto dei lavoratori resta vincolato al proprio auth.uid dalle policy precedenti.

## Verifica
- tests/colleague-upload-db.test.mjs (PGlite): disattivazione iniziale, sede, esclusione altre sedi, autore/destinatario, conferme duplicati, sostituzione, idempotenza, persona non registrata, chiave Drive dopo associazione, cartelle esistenti preservate, cambio sede prima invio e RPC negate ai lavoratori. Include validazione della persona nel controllo ore.
- tests/colleague-upload-http.test.mjs: autenticazione, actor server, directory minima, firme file e preparazione firmata.
- Browser fixture tests/fixtures/colleague-upload-review.html: selezione e conferma nome, bozza distinta, invio simulato e ricevuta. Nessun file reale trasmesso.
- Database reale: directory e preparazione provate in transazione con rollback, nessun caricamento Storage o documento/archiviazione reale creato. Endpoint senza credenziali restituisce 401. Zero lavoratori abilitati, zero intent e zero documenti delegati dopo le prove.
- Regressioni ferie/ROL, budget settimanali, sedi, prospettiva, pulizia immagini e PDF multipagina superate.
- Drive confrontato con la funzione live v9 prima dell’aggiornamento: solo tre righe modificate, ora v10. Nessun segreto o credenziale letto.
- Advisors: informazione attesa per colleague_upload_intents con RLS e nessuna policy client: è una tabella riservata al servizio; nessun grant di lettura agli utenti. Gli avvisi preesistenti sono invariati.

Non è stata eseguita una prova end-to-end su Google Drive con un documento reale: il percorso è verificato tramite test della risoluzione e integrazione con la coda esistente. Serve una verifica finale su telefono da parte dell’amministratore con un referente abilitato.
