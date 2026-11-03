# Verifica comunicazioni, versione 9.2

Il caposervizio assegnato al CDC può segnare come verificate le comunicazioni pendenti di malattia e Legge 104. Ferie e ROL conservano il flusso di autorizzazione; i congedi restano consultabili. Gli allegati sanitari non sono esposti.

La verifica aggiorna documents.review_status tramite una RPC riservata al servizio, con identità autenticata, ambito CDC e divieto di gestione delle proprie richieste. I trigger esistenti registrano reviewed_by e reviewed_at; lo storico include supervisor_review. Le comunicazioni escono dal filtro amministratore dei documenti da verificare dopo l'aggiornamento dell'elenco.

Validazione: sette test HTTP; test SQL su copie temporanee con rollback per entrambe le categorie, attribuzione, autorizzazione invariata, blocco CDC e duplicati; verifica UI con dati fittizi dal comando alla conferma e allo stato Verificata. Nessun documento reale verificato durante i test.
