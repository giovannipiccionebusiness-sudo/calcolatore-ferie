# Carica per un collega — versione 66

Il responsabile abilita il referente in Gestione → Gestione lavoratori con «Consenti caricamento documenti per colleghi della stessa sede». I permessi già salvati sono conservati. Il pulsante aggiuntivo non modifica i caricamenti personali.

Si può scegliere un collega della stessa sede fisica N153, registrato o importato dal report con assegnazione attuale. Sono disponibili presenze settimanali/definitive, ferie, ROL, Legge 104, malattia e congedo parentale. Per i congedi si possono aggiungere fino a dieci foto nell’ordine, oppure caricare un PDF completo. Le note sono limitate a 250 caratteri e non devono contenere dati sanitari. Prima dell’invio si confermano destinatario, documento e incarico ricevuto dal collega.

Il destinatario registrato riceve una notifica nella campanella quando il collega carica il documento, poi l’esito della verifica e, per ferie/ROL, l’esito separato dell’autorizzazione. Il responsabile riceve l’avviso di verifica e l’eventuale successivo avviso di autorizzazione. Le push sono accodate sui dispositivi di produzione con notifiche attive; la campanella conserva l’avviso anche senza push. Non è possibile recapitare una notifica nell’app a una persona che non possiede ancora un account. Il suo documento resta comunque visibile al responsabile in “Da gestire”.

Le notifiche push non includono categoria sanitaria, note, nome del file o dettagli dell’assenza. L’autore e il destinatario restano registrati nel documento. Il caricatore non può consultare l’archivio del collega. Ogni evento ha una chiave univoca: riprendere l’invio non duplica documenti o notifiche.

I file passano nella coda Drive esistente, nella cartella del destinatario e nella categoria corretta. Nessuna cartella storica viene spostata. Le richieste ferie/ROL restano in attesa di verifica, poi di autorizzazione; gli altri documenti richiedono verifica.

La nuova preparazione è compatibile con i client v65 e gli invii già preparati: la vecchia RPC resta disponibile e le nuove colonne hanno valori predefiniti per le presenze. Database condiviso con l’app test, senza ricreazione o reset dei dati.

Verifiche: test database PGlite per tutte le categorie, note, autorizzazioni, notifiche destinatario/responsabile, destinatari non registrati, push solo produzione, idempotenza e rifiuto di combinazioni non valide. Test HTTP per identità server e passaggio categoria/note. Regressioni ferie/ROL, budget settimanali, sedi e PDF multipagina. La consegna effettiva di una push e l’archiviazione finale Drive richiedono un invio reale da telefono; non sono simulate con notifiche a utenti reali durante i test.
