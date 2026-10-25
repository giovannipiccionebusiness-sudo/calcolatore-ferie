# Attività amministratore nella campanella

Gli amministratori attivi hanno una scheda iniziale Da gestire, distinta dai messaggi personali e dalle impostazioni push. Mostra tutti i mesi e tutte le sedi: account lavoratore inattivi da abilitare, documenti pending da verificare e richieste ferie/ROL già verificate con autorizzazione pending. Le versioni sostituite sono escluse. Gli account inattivi includono quelli disabilitati, denominati Account da abilitare senza affermare che siano nuove registrazioni.

La lista è calcolata dai dati correnti, paginata per 30 voci. Aprire un riepilogo non completa la pratica e non diminuisce il suo conteggio. Una verifica può trasferire la voce nella fase di autorizzazione; abilitazioni, rifiuti e autorizzazioni completate la rimuovono. La campanella somma le attività da gestire ai messaggi personali non letti e descrive separatamente i due conteggi nell’etichetta accessibile.

I collegamenti aprono Documenti → Gestione e verifiche, impostano mese e sede e portano alla riga corrispondente, espandendo le liste compatte. Non eseguono approvazioni: restano i controlli e le conferme esistenti. Dopo un’operazione il riepilogo si aggiorna con refreshAdmin. Restano gli aggiornamenti al ritorno nell’app, ogni minuto e tramite Aggiorna attività.

L’API inbox aggiunge il riepilogo solo per profili admin attivi. admin_tasks verifica esplicitamente il ruolo lato server. get_admin_notification_tasks è SECURITY INVOKER, eseguibile solo da service_role, e ricontrolla il ruolo dell’attore. I lavoratori mantengono lo storico personale e non possono vedere la coda amministrativa. Nessun push esterno aggiuntivo viene inviato per questa modifica.

Verifiche: dati fittizi con rollback per registrazione, caricamento, verifica prima di autorizzazione, completamento, blocco lavoratori e privilegi RPC; browser smartphone per tab iniziale, conteggi, passaggio della pratica/mese al pannello e permanenza del conteggio dopo lettura; regressione dello storico lavoratore e delle impostazioni.
