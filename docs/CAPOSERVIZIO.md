# Caposervizio N153

La capability `supervisor_assignments` si aggiunge al normale account worker: non conferisce il ruolo admin e non cambia le policy esistenti di documenti, profili, archivio, presenze o Storage.

L'area Gestione N153 compare nella home personale solo dopo una verifica server dell'account attivo e del CDC assegnato. Permette di consultare i metadati organizzativi (periodo/note senza dati sanitari, tipologia, stato) di ferie, ROL, malattie, Legge 104 e congedi, filtrando per mese e lavoratore. Il periodo è quello dichiarato nella nota del caricamento, non viene dedotto dal documento.

Per ferie e ROL è disponibile l'originale con URL firmato di 90 secondi. Il caposervizio può verificare e autorizzare la richiesta in un'unica operazione; un diniego richiede una motivazione visibile al lavoratore. Gli allegati di malattia, 104 e congedo restano al responsabile. Le richieste proprie sono escluse anche se caricate per delega e collegate tramite il registro lavoratori. Rimangono gestibili dall'amministratore.

## Sicurezza e storico

`supervisor-access` verifica il Bearer token con Auth e legge la capability dal database, mai dai metadati modificabili dal lavoratore. Le letture e gli URL sono limitati al CDC assegnato e alla sede attuale del destinatario. Il client non riceve i percorsi dei file sanitari. La RPC `supervisor_decide` è SECURITY INVOKER ed eseguibile solo da service_role: effettua nuovamente i controlli su attore, CDC, categoria e titolarità e blocca il documento durante la decisione. I trigger esistenti di validazione e audit restano invariati. Una decisione già salvata non può essere ripetuta dalla nuova area.

L'amministratore conserva controllo e visibilità completi. Lo storico riporta l'evento Autorizzazione caposervizio con attore, documento, esito e motivazione. L'esito è immediatamente visibile in I miei caricamenti; la campanella e la coda push esistente ricevono un avviso. Ogni nuovo documento di queste categorie genera un avviso generico per il caposervizio, senza informazioni sanitarie sulla notifica del telefono.

Per revocare la capability rimuovere la relativa riga da `supervisor_assignments` tramite amministrazione del database. Anche la disabilitazione dell'account ne blocca la gestione; non occorre rimuovere il normale account lavoratore.

## Verifiche

- `node --test tests/supervisor-http.test.cjs`: autenticazione, account disabilitato, CDC, richieste proprie/delegate, file sanitari, attribuzione dell'attore e diniego senza motivazione.
- `tests/supervisor-access.sql`: dopo l'installazione dello schema, test con copie temporanee e ROLLBACK. Verifica decisione, audit, duplicati, ambito e permessi della RPC. Non modifica richieste reali e non accoda notifiche reali.
- Verifica browser della finestra e del flusso di diniego con dati fittizi.
