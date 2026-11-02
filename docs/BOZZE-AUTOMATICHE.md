# Compilazione automatica delle dichiarazioni — 9.1

Quando un lavoratore salva la giornata, la dichiarazione persistita in `daily_presence` alimenta automaticamente la vista del foglio presenze e i due controlli di budget. Non serve più premere «Verifica e acquisisci» per far comparire ordinario, supplementare e causale. Anche le dichiarazioni già inserite vengono mostrate al caricamento. Il supplementare resta distinto dall'ordinario e tutte le ore sono espresse in decimali.

La bozza propone l'ordinario dal contratto giornaliero meno l'assenza dichiarata: 4 ore senza variazioni → O 4,00 / S 0,00; con 1 h 30 di ROL → O 2,50 / assenza 1,50; giornata intera di assenza → O 0,00. Nessuna presenza viene creata per giornate senza dichiarazione o future. Se contratto, sede o ripartizione su più sedi mancano o sono incoerenti, la bozza indica cosa completare; non viene assegnata una sede arbitraria e non entra nei totali per sede.

## Bozze e verifiche

Le bozze gialle restano «da verificare». I totali principali contengono soltanto ore verificate, con riepiloghi separati per le bozze e per «verificate + bozze». L'amministratore apre la giornata già compilata, controlla, corregge se necessario e conferma. Le ferie e le altre assenze mantengono i flussi di autorizzazione esistenti.

Le bozze sono una proiezione deterministica dei dati già salvati, non nuove righe copiate in produzione. Ogni coppia lavoratore/giorno compare una volta. Non sono introdotti trigger, nuove autorizzazioni o modifiche massive alle presenze confermate. La conferma usa l'attuale salvataggio amministratore con controllo versione e audit, e registra nel riferimento la versione della dichiarazione riconciliata. Il modulo conserva la lettura della RPC di acquisizione esistente per compatibilità.

Se il lavoratore modifica una dichiarazione dopo la verifica, la nuova versione torna come bozza «modificata, ricontrolla». Il vecchio record rimane nello storico, ma non contribuisce come presenza attualmente verificata fino alla riconciliazione. Non si sommano il vecchio e il nuovo supplementare. Anche la conferma Ergoweb risulta da ricontrollare quando cambiano i dati rilevanti; i fingerprint senza bozze mantengono il formato precedente.

I pannelli aperti controllano le nuove dichiarazioni ogni 30 secondi e al ritorno in primo piano; il controllo è sospeso a finestra nascosta e mentre si sta compilando una verifica. Aprire o aggiornare il pannello legge subito i dati correnti. I contratti, le assegnazioni e i documenti continuano a ricaricarsi con l'aggiornamento completo del pannello.

## Validazione

- Test `presence-drafts.test.mjs`: bozze senza variazioni, assenza parziale/intera, supplementare distinto, versioni, idempotenza, non duplicazione, conservazione del dato manuale verificato, orari ignoti, sedi mancanti/multiple, giorni futuri, CDC a sede unica e arrotondamento al minuto.
- Regressioni: presenze mensili, acquisizione esistente, budget settimanale e mensile, festività, trasferimenti, fogli sostituiti, giorni futuri e sabati.
- Browser con dati fittizi: comparsa automatica O 4,00 / S 1,50; conferma manuale; modifica a S 2,00 che torna da verificare senza duplicare le ore; totali coerenti in Budget ore e nel Controllo ore per sede esistente.
