# Notifiche Lavoro Facile

Attivazione volontaria con guida Android/iPhone. Dopo una prova inviata correttamente il riquadro si nasconde e resta Gestisci avvisi. Il simbolo piccolo Android è una sagoma trasparente monocromatica; il logo completo resta nell'immagine della notifica.

La funzione app-web-push verifica la sessione per gestire solo la sottoscrizione del proprio dispositivo. Riutilizza il servizio collaudato nelle tabelle test_push_config, test_push_subscriptions e test_push_queue, protette da RLS e senza accesso diretto anon/authenticated. Il dispatcher richiede un token privato server. Le chiavi private non sono nel client o nel repository.

Il cron esistente lavoro-facile-test-push gestisce tutti i dispositivi registrati: venerdì dalle 17:00 alle 20:00 e ultimo giorno del mese dalle 18:00 alle 20:00, fuso Europe/Rome. Controlla i documenti prima della coda e prima dell'invio; coda univoca e massimo tre tentativi. L'avviso di abilitazione riguarda chi attiva le notifiche mentre è ancora in attesa, senza invii retroattivi per account già attivi.

Il payload è generico e il service worker mostra il messaggio e apre il percorso della propria app. I dispositivi ufficiali e test hanno sottoscrizioni distinte, pur usando lo stesso servizio backend. Chi aveva autorizzato il test deve attivare le notifiche anche nell'app ufficiale. L'uscita annulla la sottoscrizione locale. Nessuna notifica è inviata per il solo aggiornamento dell'app.
