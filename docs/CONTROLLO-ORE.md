# Controllo ore N153 — prima versione amministratore 62

## Utilizzo
Gestione → Controllo ore per sede · N153. Scegli primo giorno e sede (vista di sette giorni). Apri «Organico e assegnazioni sedi»: seleziona ogni persona importata, assegna sede e decorrenza, oppure escludila dal perimetro con decorrenza. Gli orari sono quelli già salvati e confermati nel calcolatore ferie, comprese le distribuzioni su cinque/sei giorni e le eccezioni giornaliere. Conferma che l’organico del mese sia completo.

Il budget comprende le persone del report, non solo gli account attivi. Il collegamento account continua a essere gestito nella sezione ferie e non crea una seconda persona. Eventuali account attivi N153 non collegati al report impediscono un esito definitivo. Non vengono dedotte sedi dallo storico né effettuati abbinamenti automatici. Le assegnazioni per il budget sono datate e distinte dalla sede corrente del profilo. Non si modificano profili o configurazioni ferie.

Apri «Verifica ore dal foglio presenze»: scegli persona e giorno, consulta il foglio più recente disponibile, inserisci ore ordinarie e straordinarie effettive per la sede in cui sono state svolte. Puoi ripartire la giornata su più sedi. Le assenze restano separate. Conferma il controllo. Per chi non ha account puoi verificare un foglio cartaceo/esterno e registrarne il riferimento: questa versione non archivia un nuovo allegato per conto della persona non registrata. Registra anche i riposi con zero ore per escludere straordinari o trasferte non rilevati.

Per festività, chiusure o variazioni del servizio, «Budget eccezionale» permette di confermare il totale previsto della sede per una data, con motivo obbligatorio. Il budget base segue il contratto senza dedurre automaticamente festività o assenze.

## Stati
Verde: totale uguale. Blu: risparmio. Rosso: superamento da verificare, non dichiarazione automatica di errore individuale. Arancione: organico, sede, orario o presenze incompleti. In arancione si mostrano solo i totali parziali; non è indicato un risparmio. Per prudenza tutti gli inclusi devono avere le presenze verificate, anche quando assegnati ad altre sedi: potrebbero avere svolto sostituzioni nella sede selezionata.

Un foglio successivo che copre il giorno rende da riconfermare i dati associati al foglio precedente. Una persona/giorno ha un solo record, quindi le revisioni sostituiscono e non sommano le ore. Gli inserimenti manuali esterni restano verifiche amministrative esplicite.

## Dati e limiti
Tabelle nuove e separate hour_budget_assignments/days/calendar/roster/audit. RLS amministratore, nessun accesso lavoratore/anonimo. Vincoli su sedi, documenti, minuti, massimo 24 ore persona/giorno, versioni e audit transazionale. Collegamento foglio controllato lato database usando l’associazione account del registro HR. Un helper privato legge solo l’account corrispondente dopo controllo amministratore. Nessuna nuova Edge Function; lettura anagrafica/orari tramite le API esistenti.

Non è ancora presente OCR: le ore del foglio vengono inserite e confermate dall’amministratore. Non vengono aggiornati saldi ferie, ROL, ledger, approvazioni richieste o file originali.

## Verifiche
- tests/hour-budget.test.mjs: lavoratori senza account, decorrenze, assenze e sostituzioni, risparmio/superamento, ripartizione sedi, dati incompleti, fogli sostituiti, budget eccezionale e minuti esatti.
- tests/hour-budget-db.test.mjs: schema Postgres locale PGlite, scrittura e lettura admin, audit, vincoli, concorrenza ottimistica, isolamento lavoratore, anonimo bloccato. Riproducibile con npm ci --prefix tests/rest-db --ignore-scripts; REST_PGLITE_MODULE impostato al percorso assoluto di tests/rest-db/node_modules/@electric-sql/pglite/dist/index.js.
- Database con ruolo amministratore e lavoratore, transazioni rollback: salvataggio, audit e rifiuto scrittura lavoratore superati. Tabelle operative e audit nuove vuote dopo le prove.
- Browser con dati fittizi: apertura, caricamento orari, registrazione 4 ore ordinarie + 1 straordinario contro budget 4; indicazione rossa di +1 ora confermata. Fixture tests/fixtures/hour-budget-review.html.
- Regressioni ferie, prospettiva fotocamera e sedi N153 superate. Nessun advisor riferito alle nuove tabelle/funzioni; avvisi preesistenti non modificati.
