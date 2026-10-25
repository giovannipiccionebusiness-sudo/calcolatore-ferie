# Centro notifiche personale

La campanella è visibile dopo l’accesso, in alto a destra in Documenti e Calcolatore. Il contatore rappresenta tutti gli avvisi personali non letti, senza includere quelli di altri account. Aprire la schermata non segna tutto come letto: ogni messaggio viene segnato quando aperto; il comando esplicito segna i soli avvisi della pagina corrente. Lo storico ha pagine di 30 avvisi e resta disponibile disattivando il push o cambiando telefono.

La scheda Avvisi sul telefono ospita i controlli esistenti di attivazione/disattivazione, prova e istruzioni per iPhone o autorizzazioni bloccate. La disattivazione riguarda il dispositivo attuale. Nessuna richiesta automatica di permesso. La schermata principale non contiene più il riquadro ingombrante degli avvisi.

## Persistenza e accesso

app_notifications conserva un messaggio per lavoratore ed evento, indipendente dalle sottoscrizioni push. Gli avvisi precedenti ancora presenti nella coda di produzione sono recuperati senza inviare nuovamente alcun push. Gli avvisi relativi a sottoscrizioni già eliminate prima dell’aggiornamento non possono essere ricostruiti. Nessuna scadenza automatica per lo storico.

Gli invii manuali salvano prima il messaggio per tutti i destinatari validi, anche senza push attivo. I promemoria settimanali e mensili sono salvati dal job esistente anche per chi non ha sottoscritto il push. La richiesta del definitivo continua a escludere chi ha già caricato un definitivo non respinto. I trigger della coda non duplicano l’evento su più telefoni.

RLS è abilitato e tutti i permessi diretti per anon/authenticated sono revocati. Le API inbox/read_notice/read_notices verificano getUser e impongono user_id dell’utente autenticato per ogni select, count e update. Non accettano un destinatario dal browser. Gli aggiornamenti lettura non modificano testo o destinatario. Le funzioni SQL sono SECURITY INVOKER e non eseguibili dai client.

Il contatore si aggiorna all’accesso, al ritorno nell’app, quando si apre la schermata, al segnale del service worker e ogni minuto se la pagina è visibile. Il tocco di un nuovo push mostra il pop-up esistente e segna letto l’evento tramite la sua chiave. Per i vecchi push privi della chiave resta disponibile la lettura dallo storico. Un push accettato dal servizio non è una ricevuta di lettura.

## Verifiche

Test con dati fittizi e rollback: messaggio senza sottoscrizione, idempotenza, deduplicazione su due telefoni, storico dopo cancellazione sottoscrizione, permessi tabella. Test API con identità contraffatta nel body: tutti i filtri restano sull’utente autenticato. Test browser smartphone/desktop: campanella, conteggio, lettura singola e pagina, testo HTML innocuo, impostazioni, pulizia dei dati al logout. Nessun messaggio di prova inviato a lavoratori reali.
