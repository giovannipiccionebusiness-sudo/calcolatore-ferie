# Notifiche e messaggi del responsabile

I promemoria automatici restano venerdì alle 17:00 e ultimo giorno del mese alle 18:00, fuso Europe/Rome. Sono inviati solo a lavoratori attivi senza la relativa consegna valida. I testi distinguono aggiornamento settimanale e definitivo mensile completo e firmato.

In Documenti → Gestione e verifiche → Messaggi ai lavoratori, l’amministratore può scegliere tutti, una sede o un lavoratore e inviare un messaggio di servizio (600 caratteri) oppure richiedere il definitivo del mese selezionato, anche prima della fine del mese. L’invio richiede conferma di testo e destinatari. Il definitivo già caricato, anche in verifica e non respinto, esclude il lavoratore dal sollecito. Non vanno anticipate ore non ancora lavorate.

Le richieste sono accodate al prossimo ciclo del servizio (ogni minuto), con ritentativi limitati. L’esito distingue telefoni accodati, lavoratori raggiungibili, senza notifiche e già in regola. Accodato o accettato dal servizio push non significa letto o consegnato al telefono.

L’app sincronizza le chiavi di cifratura dei telefoni già abilitati al prossimo accesso. Non occorre riattivare il consenso. Finché il lavoratore non apre l’app aggiornata, i vecchi dispositivi mantengono i promemoria generici e non sono inclusi negli invii personalizzati. Il testo può apparire sullo schermo bloccato: non inserire dati sanitari o documenti.

Il payload è cifrato aes128gcm con web-push 3.6.7 e VAPID esistente. Il tocco della notifica conserva il testo in IndexedDB per l’avvio dell’app (massimo 24 ore), con identificativo casuale nell’URL; il testo non va nell’URL. Il pop-up mostra il messaggio una volta e lo elimina dalla memoria locale.

## Backend condiviso

Le funzioni app-web-push e test-web-push utilizzano le tabelle protette test_push_* e il job cron esistente. test-web-push esegue il dispatch condiviso. app_scope distingue i dispositivi ufficiali e test: i messaggi manuali sono inviati soltanto a production.

RLS resta attivo senza accesso diretto dei client. L’API verifica bearer con getUser e ruolo/abilitazione in profiles, mai user_metadata. enqueue_admin_push è accessibile solo al service_role e ricontrolla il ruolo. L’accodamento è atomico, con identificativo contro i duplicati e intervallo minimo di un minuto per amministratore. Endpoint ammessi e VAPID privati restano sul server.

I file SQL sono modifiche additive allo schema esistente, non uno schema per un progetto vuoto.

## Verifiche

Destinatari fittizi e rollback: esclusione del definitivo, permessi, selezione destinatari, idempotenza, intervallo tra invii. Test locali: cifratura/decifratura payload, blocco invio per lavoratore, modulo mobile con anteprima e conferma, pop-up con testo esatto e rimozione dopo apertura. Nessun messaggio di prova inviato a lavoratori reali.
