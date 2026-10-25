# Push delle attività amministratore

Il centro notifiche amministratore aveva solo la lista delle attività in-app; ora il job esistente accoda anche push per account da abilitare, caricamenti da verificare e ferie/ROL verificati da autorizzare. Le attività pendenti già esistenti sono incluse al primo ciclo.

private.collect_admin_push è SECURITY INVOKER, non accessibile ai client. Il job lo chiama ogni minuto e usa solo dispositivi production con chiavi di cifratura di profili admin attivi. Le chiavi evento admin_registration/admin_review/admin_authorization + ID rendono ogni evento unico per dispositivo. La verifica di un documento può generare il successivo avviso di autorizzazione; la consultazione dell’elenco non lo completa.

Prima di inviare, il dispatcher ricontrolla ruolo, attività e scope del destinatario e lo stato corrente della pratica. Attività risolte, rifiutate, sostituite o utenti già abilitati vengono saltati. Il messaggio push è generico, senza nomi, tipologia sanitaria o contenuti dei documenti. Il tocco mostra il pop-up e la campanella consente di gestire la pratica.

I push admin hanno priorità high e TTL di un’ora, anziché i cinque minuti dei promemoria lavoratore. Il service worker richiede notifiche non silenziose e vibrazione, con tag e renotify. Suono, vibrazione, connessione, risparmio energetico e Non disturbare restano controllati da browser e sistema operativo; la web app non può garantire squilli o consegna immediata.

Le impostazioni riconoscono il ruolo amministratore e descrivono gli avvisi corretti. Il consenso già presente resta valido; nessun permesso è richiesto automaticamente.

Test con rollback: accodamento registrazione/caricamento/autorizzazione, deduplica, ruoli separati e titolo inbox. Test locali: esclusione pratiche concluse/sostituite, admin disabilitato o scope test, opzioni showNotification, cifratura e decifratura payload. Nessun push di prova a destinatari reali; il job attivato invia gli avvisi effettivi autorizzati.
