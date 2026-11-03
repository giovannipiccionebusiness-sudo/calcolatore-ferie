# Pannello amministratore — 9.3

La pagina iniziale presenta sei accessi principali, due contatori con accesso diretto alle code e un menu Altri strumenti. Viene mostrata soltanto la funzione selezionata, su telefono e desktop. Mese e CDC sono raccolti in un filtro espandibile; presenze, budget e notifiche mantengono i propri filtri specifici.

Il menu resta disponibile durante la consultazione. Gli elenchi di documenti, lavoratori, dichiarazioni, consegne e storico hanno ricerca e pagine da dieci elementi. I controlli di modifica del lavoratore si aprono per nominativo. La ricerca dei lavoratori considera i dati assegnati e l'email, non tutte le opzioni dei selettori.

I pannelli originali restano nel DOM con gli stessi identificativi e listener: nessuna duplicazione dei pulsanti di verifica o autorizzazione. La presentazione non modifica dati, permessi o notifiche. Il collegamento dalle notifiche apre la sezione e la pagina corrette, eliminando eventuali filtri di ricerca incompatibili.

Verifiche eseguite con dati fittizi e HTML della pagina corrente, in browser:
- Home smartphone a 390 px: sei accessi, code prioritarie, altri strumenti raccolti.
- Tredici destinazioni raggiungibili; una sola sezione visibile (due liste originali nella destinazione documenti).
- Nessuno scorrimento orizzontale nelle destinazioni provate.
- Ricerca documenti e delega del clic al pulsante originale.
- Ricerca lavoratore 53, paginazione 53 account e apertura del dettaglio.
- Ricerca conservata dopo rigenerazione degli elenchi.
- Apertura da notifica del lavoratore 53: pagina 6 di 6 e dettaglio aperto.
- Home e apertura presenze su desktop.
- Controllo sintassi di app, menu, service worker e versione.

Non sono state inviate notifiche né modificate presenze o richieste reali durante le prove.
