# Presenze giornaliere — versione ufficiale 7.4

L’integrazione parte dal commit ufficiale 2a5d867d9c96e232618a3e6fe34e57005f7ba7bd e aggiunge la compilazione giornaliera e il riepilogo settimanale, mantenendo caricamenti, deleghe, moduli, documenti, archivio Drive, budget, ferie, notifiche esistenti e conferma manuale delle presenze.

Il lavoratore inserisce supplementare e giustificativi oppure conferma «Nessuna variazione». Le durate sono salvate in minuti: 1,30 / 1.30 / 1:30 corrispondono a 90 minuti, mostrati come 1,50 ore in amministrazione. Il riepilogo recupera gli stessi giorni senza duplicarli. I dati dichiarati sono visibili anche nel foglio mensile e nel dettaglio del giorno, come informazioni da verificare; non sovrascrivono le ore confermate e non determinano automaticamente l’ordinario.

L’amministratore imposta fino a due fasce per giorno, riposi e decorrenza. Il promemoria è calcolato 30 minuti prima dell’ultima uscita. Sono supportati turni notturni, versioni concorrenti e cambi futuri. L’orario contrattuale usato per i budget non viene cambiato dalle fasce del promemoria. Nessuna fascia reale è stata dedotta o copiata dalla prova.

Le nuove notifiche usano la campanella ufficiale e il suo storico. Il service worker mantiene il percorso dei vecchi messaggi e aggiunge i collegamenti ai giorni e alle settimane. Il servizio daily-presence-push utilizza solo sottoscrizioni production. I vecchi promemoria per caricare i fogli rimangono indipendenti. Il registro e le tabelle della prova non vengono importati o modificati.

Database: sei nuove tabelle (worker_week_changes, daily_presence, presence_week_confirmations, daily_notices, daily_deliveries, worker_shifts), con RLS e RPC limitate al lavoratore attivo o all’amministratore. La migrazione è solo aggiuntiva: non sostituisce funzioni o tabelle già presenti, non cancella dati esistenti e non attiva il cron. Il cron viene configurato separatamente dopo la pubblicazione. Nessuna lettura IA viene riattivata.

Verifiche: migrazione e prove SQL eseguite in transazioni annullate prima dell’applicazione; controllo RLS e versioni, giornate future, ore e assenze, riposi, turni spezzati/notturni, fuso Italia, deduplicazione e sincronizzazione della campanella. Test delle presenze e dei budget esistenti superati. Prova browser con dati fittizi: vecchio messaggio leggibile, nuovo avviso che apre il giorno, durata 1.30 salvata correttamente. La consegna effettiva al telefono richiede permessi attivi e verifica dal dispositivo.
