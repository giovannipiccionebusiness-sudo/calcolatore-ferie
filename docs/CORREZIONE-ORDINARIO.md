# Ordinario proposto nell'acquisizione — 9.0

Il pulsante Verifica e acquisisci trasferiva supplementare e assenze ma lasciava l'ordinario al valore iniziale zero. Ora una nuova giornata, con una sola sede, propone l'ordinario contrattuale del giorno meno i minuti di assenza dichiarati. Il supplementare resta separato. Per esempio: 4 ore contrattuali, zero supplementare e nessuna assenza → O 4,00 e S 0,00. Un'assenza di 1 h 30 porta O a 2,50 e assenza a 1,50. Un'assenza intera propone O 0,00.

La proposta resta soggetta al controllo e alla conferma dell'amministratore. Se il contratto manca, l'ordinario va inserito esplicitamente; con più sedi non viene distribuito automaticamente. Le ore ordinarie già salvate, incluso uno zero, restano invariate per rispettare i vincoli esistenti di acquisizione: le correzioni si effettuano dal salvataggio manuale verificato. Questa modifica non introduce acquisizione automatica delle dichiarazioni e non modifica dati di presenze già confermati.

Test: `node --test tests/ordinary-acquire.test.mjs` copre il caso iniziale da 4 ore, supplementare separato, assenze parziali/intere, record esistenti, più sedi, riposo e contratto sconosciuto.
